// lib/tool-registry.js — agentboard 核心逻辑唯一真相源
// 被 server.js (REST) 和 lib/mcp-http.js (MCP) 共享
// 改一处，两面自动生效

var fs = require('fs');
var path = require('path');
var os = require('os');
var child_process = require('child_process');
var schema = require('./manifest-schema');
var opslog = require('./ops-log');

var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(os.homedir(), '.agentboard');
var DEFAULT_TOOLS_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
var PLATFORM = process.platform;

// ── 内部工具函数 ──

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function listDirs(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }).filter(function (e) { return e.isDirectory() && !e.name.startsWith('.'); }).map(function (e) { return e.name; }); } catch (_) { return []; }
}

var RUNTIME_DIR = path.join(AGENTBOARD_HOME, '_runtime', 'pids');

function pidFile(id) {
  return path.join(RUNTIME_DIR, id + '.pid');
}

function readPidAlive(id) {
  // 读 PID 文件，返回还活着的 PID。死了/不存在返回 null
  var raw = read(pidFile(id));
  if (!raw) return null;
  var pid = parseInt(raw.trim(), 10);
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (_) {
    // 进程已死，清理过期 PID 文件
    try { fs.unlinkSync(pidFile(id)); } catch (__) {}
    return null;
  }
}

function writePid(id, pid) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(pidFile(id), String(pid), 'utf8');
  } catch (_) {}
}

function clearPid(id) {
  try { fs.unlinkSync(pidFile(id)); } catch (_) {}
}

function winPath(p) {
  if (!p) return p;
  // 展开 %VAR% 环境变量（Node.js cwd 不走 shell，必须手动展开）
  p = p.replace(/%([^%]+)%/g, function (_, name) { return process.env[name] || '%' + name + '%'; });
  var m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}

function dirsOrDefault(dirs) {
  return (dirs && dirs.length > 0) ? dirs : [DEFAULT_TOOLS_DIR];
}

// ── 端口检测（单次 netstat + TTL 缓存） ──

var _portsCache = null;
var _portsCacheTime = 0;
var _scanCache = null;
var _scanCacheTime = 0;
var _scanCacheKey = '';
var CACHE_TTL = 5000;
var PROC_CACHE_TTL = 30000;

function getListeningPorts() {
  var now = Date.now();
  if (_portsCache && (now - _portsCacheTime) < CACHE_TTL) return _portsCache;
  var ports = new Set();
  try {
    if (PLATFORM === 'win32') {
      var out = child_process.execSync('netstat -ano', { timeout: 3000, encoding: 'utf8', shell: true, windowsHide: true });
      var re = /\s+TCP\s+\S+:(\d+)\s+.*LISTENING/gi;
      var m;
      while ((m = re.exec(out)) !== null) { ports.add(parseInt(m[1], 10)); }
    } else if (PLATFORM === 'darwin') {
      var out = child_process.execSync('lsof -i -n -P 2>/dev/null', { timeout: 3000, encoding: 'utf8', shell: true });
      var re = /:(\d+)\s+\(LISTEN\)/gm;
      var m;
      while ((m = re.exec(out)) !== null) { ports.add(parseInt(m[1], 10)); }
    } else {
      var out = child_process.execSync('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', { timeout: 3000, encoding: 'utf8', shell: true });
      var re = /:(\d+)\s+/gm;
      var seen = {};
      var m;
      while ((m = re.exec(out)) !== null) {
        var p = parseInt(m[1], 10);
        if (!seen[p]) { seen[p] = true; ports.add(p); }
      }
    }
  } catch (e) {
    opslog.error('netstat-failed', 'port scan failed', { error: e.message, platform: PLATFORM });
  }
  _portsCache = ports;
  _portsCacheTime = now;
  return ports;
}

function isPortActive(port) {
  return getListeningPorts().has(port);
}

// ── 端口身份验证：谁在监听这个端口？ ──
function getPortPid(port) {
  try {
    if (PLATFORM === 'win32') {
      var out = child_process.execSync('netstat -ano', { timeout: 3000, encoding: 'utf8', shell: true, windowsHide: true });
      var re = new RegExp('\\s+TCP\\s+\\S+:(\\d+)\\s+.*LISTENING\\s+(\\d+)', 'gi');
      var m;
      while ((m = re.exec(out)) !== null) {
        if (parseInt(m[1], 10) === port) return parseInt(m[2], 10);
      }
    }
  } catch (_) {}
  return null;
}

// ── 进程验证（tasklist 批量缓存） ──

var _procsCache = null;
var _procsCacheTime = 0;

var SHELL_BUILTINS = [
  'cd', 'chdir', 'dir', 'echo', 'set', 'rem', 'md', 'mkdir', 'rd', 'rmdir',
  'del', 'erase', 'copy', 'move', 'ren', 'rename', 'type', 'cls', 'exit',
  'pushd', 'popd', 'call', 'start', 'title', 'path', 'prompt', 'color',
  'date', 'time', 'verify', 'vol', 'label', 'subst', 'if', 'for', 'goto'
];
var EXE_WRAPPERS = { npx: 'node.exe', npm: 'node.exe', yarn: 'node.exe', pnpm: 'node.exe' };

function getProcessName(mf) {
  // 1) stopCommand 里的 taskkill 直接给 exe 名
  if (mf.stopCommand) {
    var m = mf.stopCommand.match(/taskkill\s+(?:\/\w+\s+)*\/IM\s+(\S+\.exe)/i);
    if (m) return m[1];
  }

  if (!mf.startCommand) return null;

  // 2) 拆解复合命令: 跳过 shell builtin + 分号/&&/||, 取最后一段
  var segs = mf.startCommand.split(/&&|\|\||\|/);
  var lastSeg = segs[segs.length - 1].trim();

  // 3) 从最后一段提取第一个非 builtin 可执行词
  var words = lastSeg.split(/\s+/);
  var exe = null;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w) continue;
    // 跳过 shell builtin
    if (SHELL_BUILTINS.indexOf(w.toLowerCase()) >= 0) continue;
    // 跳过 cmd /c
    if (w.toLowerCase() === 'cmd' && words[i+1] && words[i+1].toLowerCase() === '/c') { i++; continue; }
    exe = w;
    break;
  }
  if (!exe) return null;

  // 4) node 后跟脚本 → 进程名是 node.exe
  if (/^(node(\.exe)?)$/i.test(exe)) return 'node.exe';

  // 5) 已知 wrapper → 映射到实际进程
  var lower = exe.replace(/\.exe$/i, '').toLowerCase();
  if (EXE_WRAPPERS[lower]) return EXE_WRAPPERS[lower];

  // 6) 显式 .exe → 直接返回
  if (/\.exe$/i.test(exe)) return exe;

  // 7) 看起来像可执行文件 → 补 .exe
  if (/^[a-z][a-z0-9_-]+$/i.test(exe)) return exe + '.exe';

  // 8) 无法确定 → null (不阻断端口检测结果)
  return null;
}

// ── Windows 命令解析：拆 cd / set 前缀 + 识别可直 spawn 的可执行文件 ──

// 可直接 spawn 的真实 .exe（非 .cmd/.bat 批处理包装）
var DIRECT_SPAWN_EXES = { node: 1, 'node.exe': 1, python: 1, 'python.exe': 1, py: 1, 'py.exe': 1 };

function parseWindowsCommand(command) {
  // 展开 %VAR% 环境变量
  var expanded = command.replace(/%([^%]+)%/g, function(_, name) {
    return process.env[name] || '%' + name + '%';
  });

  var parts = expanded.split('&&').map(function(p) { return p.trim(); });
  var overrides = { cwd: null, env: {} };

  // 提取 cd / set 前缀段（除最后一段外的所有段）
  for (var i = 0; i < parts.length - 1; i++) {
    var p = parts[i];
    var cdMatch = p.match(/^cd\s+\/d\s+(.+)/i);
    if (cdMatch) { overrides.cwd = cdMatch[1].trim(); continue; }
    var setMatch = p.match(/^set\s+(\w+)=(.+)/i);
    if (setMatch) { overrides.env[setMatch[1]] = setMatch[2].trim(); continue; }
  }

  var finalCmd = parts[parts.length - 1];
  // 拆词 — 保留引号内空格
  var words = finalCmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  if (words.length === 0) return null;

  var exe = words[0];
  var args = words.slice(1).map(function(a) { return a.replace(/^"(.*)"$/, '$1'); });
  var exeLower = exe.toLowerCase();

  if (DIRECT_SPAWN_EXES[exeLower]) {
    return { direct: true, exe: exe, args: args, cwd: overrides.cwd, env: overrides.env };
  }

  return { direct: false, cwd: overrides.cwd, env: overrides.env };
}

function getRunningProcesses() {
  var now = Date.now();
  if (_procsCache && (now - _procsCacheTime) < PROC_CACHE_TTL) return _procsCache;
  var procs = new Set();
  if (PLATFORM !== 'win32') { _procsCache = procs; _procsCacheTime = now; return procs; }
  try {
    var out = child_process.execSync('tasklist /FO CSV /NH', { timeout: 5000, encoding: 'utf8', shell: true, windowsHide: true });
    var lines = out.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^"([^"]+)"/);
      if (m) procs.add(m[1].toLowerCase());
    }
  } catch (e) {
    opslog.error('tasklist-failed', 'tasklist failed — falling back to port-only', { error: e.message });
  }
  _procsCache = procs;
  _procsCacheTime = now;
  return procs;
}

function isProcessRunning(processName) {
  if (!processName) return null;
  var procs = getRunningProcesses();
  if (procs.size === 0) return null;
  return procs.has(processName.toLowerCase());
}

// ── 项目元数据提取（从 index.html 的 <title> + <meta description>） ──

function extractMeta(projectPath) {
  var html = read(path.join(winPath(projectPath), 'index.html'));
  if (!html) return {};
  var title = html.match(/<title>([\s\S]*?)<\/title>/i);
  var desc = html.match(/<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([^"']*)["']/i);
  return {
    _name: title ? title[1].trim() : null,
    _desc: desc ? desc[1].trim() : null
  };
}

// ── Manifest 定位 ──

function findManifest(id, dirs) {
  var searchDirs = dirsOrDefault(dirs);
  for (var i = 0; i < searchDirs.length; i++) {
    var p = path.join(searchDirs[i], id, 'manifest.json');
    if (fs.existsSync(p)) return p;
  }
  return path.join(DEFAULT_TOOLS_DIR, id, 'manifest.json');
}

// ── 启动失败痕迹（S2：start_failed 判定依据） ──

var START_FAILED_DIR = path.join(AGENTBOARD_HOME, '_runtime', 'start-failed');
var START_FAILED_TTL = 5 * 60 * 1000; // 5 分钟内有效

function writeStartFailed(id, info) {
  try {
    fs.mkdirSync(START_FAILED_DIR, { recursive: true });
    fs.writeFileSync(path.join(START_FAILED_DIR, id + '.json'), JSON.stringify(Object.assign({ ts: Date.now() }, info), null, 2), 'utf8');
  } catch (_) {}
}
function clearStartFailed(id) {
  try { fs.unlinkSync(path.join(START_FAILED_DIR, id + '.json')); } catch (_) {}
}
function readStartFailed(id) {
  try {
    var p = path.join(START_FAILED_DIR, id + '.json');
    if (!fs.existsSync(p)) return null;
    var d = JSON.parse(read(p));
    if (!d || Date.now() - d.ts > START_FAILED_TTL) return null;
    return d;
  } catch (_) { return null; }
}

// ── 核心：扫描所有工具 ──

function scanTools(dirs) {
  var cacheKey = JSON.stringify(dirsOrDefault(dirs));
  var now = Date.now();
  if (_scanCache && _scanCacheKey === cacheKey && (now - _scanCacheTime) < CACHE_TTL) return _scanCache;

  var searchDirs = dirsOrDefault(dirs);
  var seen = {};
  var tools = [];

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var names = listDirs(dir);
    names.forEach(function (name) {
      if (seen[name]) return;
      if (name.charAt(0) === '_') return; // 内部目录跳过（_runtime 等，§5 排除规则）

      var mfPath = path.join(dir, name, 'manifest.json');
      var base = { name: name, id: name, description: '', icon: '', version: '', category: '',
        order: 99, port: null, ports: [], url: '', running: false, startCommand: '', stopCommand: '',
        projectPath: '', publicUrl: '', owner: '', apiBase: '', type: 'folder', trigger: '',
        children: [], conflicts: [], agent_notes: '', capability: '', dashboard: null,
        disabled: false, autoStart: false, runtime: null };

      // orphan: 目录在但无 manifest.json（不再静默丢）
      if (!fs.existsSync(mfPath)) {
        base.state = 'orphan';
        base.stateDetail = '目录无 manifest.json';
        base.recovery = 'register';
        base.missingFields = [];
        tools.push(base);
        seen[name] = true;
        return;
      }

      var mf;
      try { mf = JSON.parse(read(mfPath)); } catch (e) {
        base.state = 'broken';
        base.stateDetail = 'manifest.json 解析失败';
        base.recovery = 'fix';
        base.missingFields = [];
        tools.push(base);
        seen[name] = true;
        return;
      }
      if (!mf || typeof mf !== 'object' || !mf.name) {
        base.state = 'broken';
        base.stateDetail = 'manifest 非对象或缺 name';
        base.recovery = 'fix';
        base.missingFields = [];
        tools.push(base);
        seen[name] = true;
        return;
      }
      seen[name] = true;

      // 从项目 index.html 补充名称和描述（仅 manifest 缺字段时才读 HTML）
      if (mf.projectPath && (!mf.name || !mf.description)) {
        var meta = extractMeta(mf.projectPath);
        if (!mf.name && meta._name) mf.name = meta._name;
        if (!mf.description && meta._desc) mf.description = meta._desc;
      }

      var ports = mf.ports || (mf.port ? [mf.port] : []);
      var portsRunning = ports.length > 0 ? ports.every(function (p) { return isPortActive(p); }) : null;
      var running = portsRunning;
      var runEvidence = '';   // 运行状态证据来源：账本确认 / 外部进程（进程名兜底）
      var pidAlive = readPidAlive(name);
      if (portsRunning === true) {
        // 三段验证 + 端口身份: PID 文件 → 进程存活 → 端口 PID 匹配 → 进程名兜底
        if (pidAlive) {
          // PID 活着 → 确认端口监听者就是它
          var primaryPort = mf.port || (mf.ports && mf.ports[0]);
          var portPid = primaryPort ? getPortPid(primaryPort) : null;
          if (portPid !== null && portPid !== pidAlive) {
            // cmd /c wrapper creates intermediate PID (cmd.exe ≠ node.exe).
            // Instead of killing the legitimate child, update the stored PID to self-heal.
            opslog.info('tool-stranger-port', name + ' port:' + primaryPort + ' occupied by PID ' + portPid + ' ≠ stored PID ' + pidAlive + ', updating stored PID', { tool: name, port: primaryPort, strangerPid: portPid, storedPid: pidAlive });
            writePid(name, portPid);
          }
          running = true;
          runEvidence = '账本确认';
        } else {
          // 无 PID 或 PID 已死 → 端口被未知进程占用。进程名兜底
          var procName = getProcessName(mf);
          var procAlive = isProcessRunning(procName);
          if (procAlive === false) running = false;
          else { running = true; runEvidence = '外部进程'; }
        }
      }

      // 状态分类（固定顺序，§3）。running 实际在跑 → start_failed 痕迹作废。
      if (running) clearStartFailed(name);

      var validation = schema.validate(mf);
      var state, stateDetail, recovery, missingFields = [];
      if (!validation.ok) {
        state = 'incomplete';
        recovery = 'complete';
        var missing = validation.errors.filter(function (e) { return e.indexOf('缺少必填字段') === 0; });
        var invalid = validation.errors.filter(function (e) { return e.indexOf('缺少必填字段') !== 0; });
        missingFields = missing.map(function (e) { var m = e.match(/缺少必填字段: (\S+)/); return m ? m[1] : e; });
        var parts = [];
        if (missing.length > 0) parts.push('缺 ' + missingFields.join('·'));
        if (invalid.length > 0) parts.push('值非法 ' + invalid.length + ' 项');
        stateDetail = parts.length > 0 ? parts.join('，') : validation.errors.join('; ');
      } else if (mf.projectPath && mf.startCommand && !fs.existsSync(winPath(mf.projectPath))) {
        state = 'stale_path';
        stateDetail = 'projectPath 不存在';
        recovery = 'migrate';
      } else if (mf.disabled) {
        state = 'disabled';
        stateDetail = running ? '已下架 · 进程运行中' : '已停用';
        recovery = 'enable';
      } else if (readStartFailed(name)) {
        state = 'start_failed';
        stateDetail = '上次启动失败（进程随即退出/超时）';
        recovery = 'retry';
      } else if (running) {
        state = 'running';
        stateDetail = runEvidence ? ('运行中 · ' + runEvidence) : '运行中';
        recovery = 'stop';
      } else if (pidAlive) {
        // 账本活着但端口未就绪 → 启动中，不是未运行
        state = 'starting';
        stateDetail = '启动中 · 进程已在';
        recovery = 'start';
      } else {
        state = 'stopped';
        stateDetail = '未运行';
        recovery = 'start';
      }

      tools.push({
        name: mf.name, id: name, description: mf.description || '',
        icon: mf.icon || '', version: mf.version || '', category: mf.category,
        order: mf.order, port: mf.port, ports: mf.ports, url: mf.url,
        running: running, startCommand: mf.startCommand, stopCommand: mf.stopCommand,
        projectPath: mf.projectPath, publicUrl: mf.publicUrl, owner: mf.owner || '',
        apiBase: mf.apiBase, type: mf.type || 'service', trigger: mf.trigger || '',
        children: mf.children || [], conflicts: mf.conflicts || [],
        agent_notes: mf.agent_notes || '',
        capability: mf.capability || '',
        dashboard: mf.dashboard || null,
        disabled: mf.disabled || false,
        autoStart: mf.autoStart || false,
        runtime: mf.runtime || null,
        state: state, stateDetail: stateDetail, recovery: recovery,
        missingFields: missingFields
      });
    });
  });

  // 运行时端口冲突检测
  tools.forEach(function (t) {
    var myPorts = t.ports || (t.port ? [t.port] : []);
    tools.forEach(function (other) {
      if (other.id === t.id) return;
      var otherPorts = other.ports || (other.port ? [other.port] : []);
      myPorts.forEach(function (p) {
        if (otherPorts.indexOf(p) !== -1) {
          t.conflicts.push({ toolId: other.id, toolName: other.name, port: p });
        }
      });
    });
  });

  tools.sort(function (a, b) {
    return (a.order != null ? a.order : 99) - (b.order != null ? b.order : 99) || a.name.localeCompare(b.name, 'zh-CN');
  });
  _scanCache = tools;
  _scanCacheTime = Date.now();
  _scanCacheKey = cacheKey;
  return tools;
}

// ── 单个工具 ──

function getTool(id, dirs) {
  var tools = scanTools(dirs);
  for (var i = 0; i < tools.length; i++) {
    if (tools[i].id === id) return tools[i];
  }
  return null;
}

// ── 启动工具 ──

// ── Supervisor delegation (single process authority) ──

function _supervisorRestart(id, port, timeoutMs) {
  try {
    var payload = JSON.stringify({ id: id });
    child_process.execSync(
      'curl -s -X POST http://127.0.0.1:3097/api/restart -H "Content-Type: application/json" -d ' + JSON.stringify(payload),
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    );
  } catch (_) {
    return { delegated: false };
  }
  if (port) {
    var maxMs = timeoutMs || 30000;
    var t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (isPortActive(port)) {
        _scanCache = null;
        _portsCache = null;
        return { delegated: true, ok: true, status: 'running', port: port };
      }
      var sleepCmd = PLATFORM === 'win32' ? 'ping -n 2 127.0.0.1 >nul' : 'sleep 0.5';
      child_process.execSync(sleepCmd, { timeout: 2000, windowsHide: true });
    }
    return { delegated: true, ok: false, error: 'Port ' + port + ' did not respond within ' + (maxMs / 1000) + 's. Check Supervisor logs.' };
  }
  _scanCache = null;
  _portsCache = null;
  return { delegated: true, ok: true };
}

function _supervisorStop(id, port, timeoutMs) {
  try {
    var payload = JSON.stringify({ id: id });
    child_process.execSync(
      'curl -s -X POST http://127.0.0.1:3097/api/stop -H "Content-Type: application/json" -d ' + JSON.stringify(payload),
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    );
  } catch (_) {
    return { delegated: false };
  }
  if (port) {
    var maxMs = timeoutMs || 10000;
    var t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (!isPortActive(port)) {
        _scanCache = null;
        _portsCache = null;
        return { delegated: true, ok: true };
      }
      var sleepCmd = PLATFORM === 'win32' ? 'ping -n 2 127.0.0.1 >nul' : 'sleep 0.5';
      child_process.execSync(sleepCmd, { timeout: 2000, windowsHide: true });
    }
    return { delegated: true, ok: false, error: 'Port ' + port + ' still active after ' + (maxMs / 1000) + 's.' };
  }
  _scanCache = null;
  _portsCache = null;
  return { delegated: true, ok: true };
}

function startTool(id, dirs) {
  var mfPath = findManifest(id, dirs);
  if (!mfPath || !fs.existsSync(mfPath)) return { ok: false, error: 'tool not found: ' + id };
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { ok: false, error: 'invalid manifest' }; }
  if (!mf.startCommand) return { ok: false, error: 'no startCommand defined' };

  // 端口冲突检测
  var myPorts = mf.ports || (mf.port ? [mf.port] : []);

  // 自检：同工具是否已在运行（读 PID 文件 + 验证存活）
  var selfPid = readPidAlive(id);
  if (selfPid) {
    return { ok: false, error: 'Already running (PID ' + selfPid + '). Stop it first.' };
  }

  // 自检：端口是否被外部进程占用（非本工具、非其他已注册工具）
  if (myPorts.length > 0) {
    var orphaned = [];
    myPorts.forEach(function (p) {
      if (isPortActive(p)) orphaned.push(p);
    });
    if (orphaned.length > 0 && !selfPid) {
      return { ok: false, error: 'Port already in use: ' + orphaned.map(function(p){return ':'+p}).join(', ') + '. Run stop to clear stale processes, then retry.' };
    }
  }

  var allTools = scanTools(dirs);

  if (myPorts.length > 0) {
    var portConflicts = [];
    allTools.forEach(function (t) {
      if (t.id === id) return;
      if (!t.running) return;
      var tp = t.ports || (t.port ? [t.port] : []);
      myPorts.forEach(function (p) {
        if (tp.indexOf(p) !== -1) portConflicts.push(t.name + '(:' + p + ')');
      });
    });
    if (portConflicts.length > 0) {
      return { ok: false, error: 'Port conflict: ' + portConflicts.join(', ') + ' already using these ports' };
    }
  }

  // Delegate resource conflict check to supervisor (single authority)
  try {
    var supRes = require('child_process').execSync(
      'curl -s http://127.0.0.1:3097/api/status', { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
    var supData = JSON.parse(supRes);
    var svc = (supData.services || []).find(function (s) { return s.id === id; });
    if (svc && svc.blocked_by) {
      return { ok: false, error: '资源冲突: 需先停止 ' + svc.blocked_by + ' 才能启动 ' + (mf.name || id) };
    }
  } catch (_) { /* supervisor down — skip, fall through to local check */ }

  // Local fallback: scan for manifest conflicts (both running + starting phase)
  var mfConflictIds = mf.conflicts || [];
  if (mfConflictIds.length > 0) {
    var localConflicts = [];
    allTools.forEach(function (t) {
      if (t.id === id) return;
      if (mfConflictIds.indexOf(t.id) === -1) return;
      // running: port is active. Also check: PID alive even if port not ready yet ("starting")
      if (t.running || readPidAlive(t.id)) {
        localConflicts.push(t.name);
      }
    });
    if (localConflicts.length > 0) {
      return { ok: false, error: '资源冲突: 需先停止 ' + localConflicts.join('、') + ' 才能启动 ' + (mf.name || id) };
    }
  }

  // ── Delegate to Supervisor (single process authority) ──
  var supPort = mf.port || (mf.ports && mf.ports[0]);
  var supResult = _supervisorRestart(id, supPort, 30000);
  if (supResult.delegated) {
    if (supResult.ok) {
      opslog.info('tool-start', 'started via Supervisor: ' + id, { tool: id, port: supPort });
    } else {
      opslog.error('tool-start', 'Supervisor restart failed for ' + id + ': ' + supResult.error, { tool: id, error: supResult.error });
      writeStartFailed(id, { error: supResult.error, via: 'supervisor' });
    }
    return supResult;
  }

  // ── Fallback: local spawn (Supervisor unreachable) ──
  opslog.info('tool-start', 'Supervisor unreachable, falling back to local spawn: ' + id, { tool: id });

  try {
    var cwd = mf.projectPath ? winPath(mf.projectPath) : AGENTBOARD_HOME;

    // preStart: 清理残留（lock 文件、僵尸端口等）
    if (mf.preStart) {
      try {
        child_process.execSync(mf.preStart, { cwd: cwd, timeout: 10000, windowsHide: true });
        opslog.info('tool-preStart', id + ' preStart ok', { tool: id });
      } catch (e) {
        opslog.info('tool-preStart-failed', id + ' preStart error: ' + e.message, { tool: id, error: e.message });
      }
    }

    var command = mf.startCommand;
    var spawnEnv = Object.assign({}, process.env, { AGENTBOARD_TOOL_NAME: id });
    var crashGuardPath = path.join(AGENTBOARD_HOME, 'lib', 'crash-guard.js');

    // 解析 Windows 命令 — 拆 cd/set 前缀，识别可直 spawn 的可执行文件
    var parsed = PLATFORM === 'win32' ? parseWindowsCommand(command) : null;

    var child;
    if (parsed && parsed.direct) {
      // ── 直 spawn：node / python / py，不包 cmd /c，PID 即端口持有者 ──
      if (parsed.cwd) cwd = parsed.cwd;
      Object.assign(spawnEnv, parsed.env);

      var finalArgs = parsed.args.slice();
      var exeLower = parsed.exe.toLowerCase();
      if ((exeLower === 'node' || exeLower === 'node.exe') && fs.existsSync(crashGuardPath)) {
        finalArgs = ['-r', crashGuardPath].concat(finalArgs);
      }

      child = child_process.spawn(parsed.exe, finalArgs, {
        cwd: cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: spawnEnv
      });
    } else if (PLATFORM === 'win32') {
      // ── Fallback: cmd /c（npm/npx 等批处理 + 复杂链式命令） ──
      if (/^node(\s|\.exe)/.test(command) && fs.existsSync(crashGuardPath)) {
        command = command.replace(/^(node(?:\.exe)?\s)/, '$1-r "' + crashGuardPath + '" ');
      }
      child = child_process.spawn('cmd', ['/c', command], {
        cwd: cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: spawnEnv
      });
    } else {
      // ── Unix: shell 模式 ──
      if (/^node(\s|\.exe)/.test(command) && fs.existsSync(crashGuardPath)) {
        command = command.replace(/^(node(?:\.exe)?\s)/, '$1-r "' + crashGuardPath + '" ');
      }
      child = child_process.spawn(command, {
        cwd: cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'], shell: true, env: spawnEnv
      });
    }
    var _startMs = Date.now();
    var _stderrChunks = [];
    child.stderr.on('data', function(d) { _stderrChunks.push(d); });
    child.on('exit', function(code, signal) {
      clearPid(id);
      _scanCache = null;
      _portsCache = null;
      var elapsed = Date.now() - _startMs;
      if (code !== 0 && elapsed < 4000) {
        var errText = Buffer.concat(_stderrChunks).toString('utf8').trim();
        if (!errText) errText = '(no stderr output)';
        opslog.error('tool-start-crash', id + ' exited code=' + code + ' after ' + elapsed + 'ms: ' + errText.substring(0, 500), { tool: id, exitCode: code, signal: signal, elapsedMs: elapsed, stderr: errText.substring(0, 500) });
        writeStartFailed(id, { code: code, signal: signal, elapsedMs: elapsed, stderr: errText.substring(0, 200) });
      }
    });
    child.on('error', function(err) {
      opslog.error('tool-spawn-error', 'tool spawn failed: ' + id, { tool: id, error: err.message });
    });
    child.unref();

    // 记下 PID，后续三段验证靠这个建立身份
    writePid(id, child.pid);

    // Notify Supervisor so its conflict detection stays accurate
    notifySupervisor(id, child.pid);

    _scanCache = null;
    if (mf.port) {
      opslog.info('tool-start', 'tool spawned, awaiting port: ' + id + ' pid=' + child.pid + ' port=' + mf.port, { tool: id, port: mf.port, pid: child.pid });
      return { ok: true, status: 'starting', port: mf.port, pid: child.pid, note: 'Service is loading. Port ' + mf.port + ' will be available when ready.' };
    }
    opslog.info('tool-start', 'tool started: ' + id + ' pid=' + child.pid, { tool: id, port: mf.port, pid: child.pid });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 停止工具（同步） ──

function stopTool(id, dirs) {
  var mfPath = findManifest(id, dirs);
  if (!mfPath || !fs.existsSync(mfPath)) return { ok: false, error: 'tool not found: ' + id };
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { ok: false, error: 'invalid manifest' }; }
  if (!mf.stopCommand) return { ok: false, error: 'no stopCommand defined' };

  // ── Delegate to Supervisor (single process authority) ──
  var supPort = mf.port || (mf.ports && mf.ports[0]);
  var supResult = _supervisorStop(id, supPort, 10000);
  if (supResult.delegated) {
    clearPid(id); // agentboard PID stale after Supervisor takeover
    if (supResult.ok) {
      opslog.info('tool-stop', 'stopped via Supervisor: ' + id, { tool: id });
    } else {
      opslog.error('tool-stop', 'Supervisor stop failed for ' + id + ': ' + supResult.error, { tool: id, error: supResult.error });
    }
    return supResult;
  }

  // ── Fallback: local kill (Supervisor unreachable) ──
  opslog.info('tool-stop', 'Supervisor unreachable, falling back to local kill: ' + id, { tool: id });

  // 优先用 PID 精确杀，不动端口上的其他服务
  var pid = readPidAlive(id);
  if (pid && PLATFORM === 'win32') {
    try {
      child_process.execSync('taskkill /PID ' + pid + ' /T /F', { timeout: 8000, encoding: 'utf8', shell: true, windowsHide: true });
      clearPid(id);
      _scanCache = null;
      _portsCache = null;
      opslog.info('tool-stop', 'tool stopped by PID: ' + id + ' pid=' + pid, { tool: id });
      notifySupervisorStop(id);
      return { ok: true };
    } catch (_) {
      // taskkill 失败 → 回退到 stopCommand
      clearPid(id);
    }
  }

  // 回退: 用 manifest 声明的 stopCommand
  try {
    child_process.execSync(mf.stopCommand, { timeout: 10000, encoding: 'utf8', shell: true, windowsHide: true });
    clearPid(id);
    _scanCache = null;
    _portsCache = null;
    opslog.info('tool-stop', 'tool stopped by command: ' + id, { tool: id });
    notifySupervisorStop(id);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 共享字段定义 ──

var BASE_FIELDS = ['description', 'icon', 'version', 'category', 'order', 'port', 'ports', 'projectPath', 'url', 'startCommand', 'stopCommand', 'publicUrl', 'owner', 'apiBase', 'type', 'trigger', 'agent_notes', 'capability', 'dashboard', 'disabled', 'runtime', 'children'];

// ── 原子写：tmp + rename，崩溃不留半截 JSON（S3）──

function writeManifestAtomic(mfPath, mf) {
  var tmp = mfPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(mf, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, mfPath); // 同盘 rename 原子
}

// ── 端口唯一性校验 ──

function checkPortUnique(port, excludeId, dirs) {
  if (!port) return null;
  // 强制绕过缓存，确保拿到最新数据
  _scanCache = null;
  var all = scanTools(dirs);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === excludeId) continue;
    if (all[i].port === port) {
      return 'Port ' + port + ' already claimed by ' + all[i].name + ' (' + all[i].id + ')';
    }
  }
  return null;
}

// ── 创建工具 ──

function createTool(body, dirs) {
  if (!body || !body.id || !body.name) return { ok: false, error: 'id and name are required' };
  if (!/^[a-z][a-z0-9_-]*$/.test(body.id)) return { ok: false, error: 'id must start with a letter, contain only a-z 0-9 - _' };

  var existing = findManifest(body.id, dirs);
  if (existing && fs.existsSync(existing)) return { ok: false, error: 'tool already exists: ' + body.id };

  var targetDir = dirsOrDefault(dirs)[0];
  var toolDir = path.join(targetDir, body.id);
  var mfPath = path.join(toolDir, 'manifest.json');

  var mf = { name: body.name };
  BASE_FIELDS.forEach(function (f) { if (body[f] !== undefined) mf[f] = body[f]; });

  var portErr = checkPortUnique(mf.port, body.id, dirs);
  if (portErr) return { ok: false, error: portErr };

  var valid = schema.validate(mf);
  if (!valid.ok) return { ok: false, error: 'Schema validation failed: ' + valid.errors.join('; ') };

  try {
    fs.mkdirSync(toolDir, { recursive: true });
    writeManifestAtomic(mfPath, mf);
    var created = getTool(body.id, dirs);
    opslog.info('tool-created', 'tool created: ' + body.id, { tool: body.id, name: body.name });
    return { ok: true, tool: created };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 更新工具 ──

function updateTool(id, body, dirs) {
  var mfPath = findManifest(id, dirs);
  if (!mfPath || !fs.existsSync(mfPath)) return { ok: false, error: 'tool not found: ' + id };

  if (!body || Object.keys(body).length === 0) return { ok: false, error: 'no fields to update' };

  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { mf = {}; } // 坏 manifest：从 body 重建，面板可修复

  var knownFields = ['name', 'conflicts', 'children'].concat(BASE_FIELDS);
  var updated = {};
  knownFields.forEach(function (f) { if (body[f] !== undefined) updated[f] = body[f]; });
  if (Object.keys(updated).length === 0) return { ok: false, error: 'no known fields to update. Known fields: ' + knownFields.join(', ') };

  for (var k in updated) { mf[k] = updated[k]; }

  var portErr = checkPortUnique(mf.port, id, dirs);
  if (portErr) return { ok: false, error: portErr };

  var valid = schema.validate(mf);
  if (!valid.ok) return { ok: false, error: 'Schema validation failed: ' + valid.errors.join('; ') };

  try {
    writeManifestAtomic(mfPath, mf);
    var tool = getTool(id, dirs);
    opslog.info('tool-updated', 'tool updated: ' + id, { tool: id });
    return { ok: true, tool: tool };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 通知 Supervisor 同步状态 ──
function notifySupervisor(id, pid) {
  try {
    var body = JSON.stringify({ id: id, pid: pid });
    child_process.execSync(
      'curl -s -X POST http://127.0.0.1:3097/api/register -H "Content-Type: application/json" -d ' + JSON.stringify(body),
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
  } catch (_) { /* supervisor unreachable — non-critical */ }
}

function notifySupervisorStop(id) {
  try {
    var body = JSON.stringify({ id: id });
    child_process.execSync(
      'curl -s -X POST http://127.0.0.1:3097/api/stop -H "Content-Type: application/json" -d ' + JSON.stringify(body),
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
  } catch (_) { /* supervisor unreachable — non-critical */ }
}

module.exports = {
  scanTools: scanTools,
  getTool: getTool,
  findManifest: findManifest,
  startTool: startTool,
  stopTool: stopTool,
  createTool: createTool,
  updateTool: updateTool,
  writeManifestAtomic: writeManifestAtomic,
  readStartFailed: readStartFailed
};
