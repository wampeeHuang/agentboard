// lib/tool-registry.js — agentboard 核心逻辑唯一真相源
// 被 server.js (REST) 和 mcp-server.js (MCP) 共享
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

var RUNTIME_DIR = path.join(AGENTBOARD_HOME, 'runtime');

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
      var mfPath = path.join(dir, name, 'manifest.json');
      var mf;
      try { mf = JSON.parse(read(mfPath)); } catch (e) { return; }
      if (!mf || !mf.name) return;
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
      if (portsRunning === true) {
        // 三段验证: PID 文件 → 进程存活 → 进程名匹配（逐级回退）
        var pidAlive = readPidAlive(name);
        if (pidAlive) {
          // PID 活着 → 确认是这个工具的进程
          running = true;
        } else {
          // 无 PID 或 PID 已死 → 端口被未知进程占用。进程名兜底
          var procName = getProcessName(mf);
          var procAlive = isProcessRunning(procName);
          if (procAlive === false) running = false;
        }
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
        disabled: mf.disabled || false
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

function startTool(id, dirs) {
  var mfPath = findManifest(id, dirs);
  if (!mfPath || !fs.existsSync(mfPath)) return { ok: false, error: 'tool not found: ' + id };
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { ok: false, error: 'invalid manifest' }; }
  if (!mf.startCommand) return { ok: false, error: 'no startCommand defined' };

  // 端口冲突检测
  var myPorts = mf.ports || (mf.port ? [mf.port] : []);
  if (myPorts.length > 0) {
    var allTools = scanTools(dirs);
    var conflicts = [];
    allTools.forEach(function (t) {
      if (t.id === id) return;
      if (!t.running) return;
      var tp = t.ports || (t.port ? [t.port] : []);
      myPorts.forEach(function (p) {
        if (tp.indexOf(p) !== -1) conflicts.push(t.name + '(:' + p + ')');
      });
    });
    if (conflicts.length > 0) {
      return { ok: false, error: 'Port conflict: ' + conflicts.join(', ') + ' already using these ports' };
    }
  }

  try {
    var cwd = mf.projectPath ? winPath(mf.projectPath) : AGENTBOARD_HOME;

    // 通用防猝死: node 命令自动注入 crash-guard 预加载
    var command = mf.startCommand;
    var spawnEnv = Object.assign({}, process.env, { AGENTBOARD_TOOL_NAME: id });
    var crashGuardPath = path.join(AGENTBOARD_HOME, 'lib', 'crash-guard.js');
    if (/^node(\s|\.exe)/.test(command) && fs.existsSync(crashGuardPath)) {
      command = command.replace(/^(node(?:\.exe)?\s)/, '$1-r "' + crashGuardPath + '" ');
    }

    var child;
    if (PLATFORM === 'win32') {
      child = child_process.spawn('cmd', ['/c', command], { cwd: cwd, detached: true, stdio: 'ignore', shell: true, env: spawnEnv });
    } else {
      child = child_process.spawn(command, { cwd: cwd, detached: true, stdio: 'ignore', shell: true, env: spawnEnv });
    }
    child.on('error', function(err) {
      opslog.error('tool-spawn-error', 'tool spawn failed: ' + id, { tool: id, error: err.message });
    });
    child.unref();

    // 记下 PID，后续三段验证靠这个建立身份
    writePid(id, child.pid);

    // 轮询端口确认启动（最多 15 秒，PID 存活双重验证）
    if (mf.port) {
      var hlthDeadline = Date.now() + 15000;
      var portReady = false;
      while (Date.now() < hlthDeadline) {
        try { child_process.execSync(PLATFORM === 'win32' ? 'ping -n 2 127.0.0.1 >nul' : 'sleep 1', { timeout: 3000, shell: true, windowsHide: true, encoding: 'utf8' }); } catch (_) {}
        _portsCache = null;
        if (isPortActive(mf.port)) { portReady = true; break; }
        // PID 已死 → 进程崩溃，不用再等
        try { process.kill(child.pid, 0); } catch (__) { break; }
      }
      if (!portReady) {
        var pidDead = false;
        try { process.kill(child.pid, 0); } catch (__) { pidDead = true; }
        var errMsg = pidDead
          ? 'Process crashed before opening port ' + mf.port + '. Check the startup command.'
          : 'Tool spawned but port ' + mf.port + ' did not respond within 15s.';
        clearPid(id);
        opslog.error('tool-start-port-timeout', errMsg, { tool: id, port: mf.port });
        return { ok: false, error: errMsg };
      }
    }

    _scanCache = null;
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

  // 优先用 PID 精确杀，不动端口上的其他服务
  var pid = readPidAlive(id);
  if (pid && PLATFORM === 'win32') {
    try {
      child_process.execSync('taskkill /PID ' + pid + ' /T /F', { timeout: 8000, encoding: 'utf8', shell: true, windowsHide: true });
      clearPid(id);
      _scanCache = null;
      _portsCache = null;
      opslog.info('tool-stop', 'tool stopped by PID: ' + id + ' pid=' + pid, { tool: id });
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
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 共享字段定义 ──

var BASE_FIELDS = ['description', 'icon', 'version', 'category', 'order', 'port', 'ports', 'projectPath', 'url', 'startCommand', 'stopCommand', 'publicUrl', 'owner', 'apiBase', 'type', 'trigger', 'agent_notes', 'capability', 'dashboard', 'disabled'];

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
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
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
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { ok: false, error: 'failed to parse manifest' }; }

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
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
    var tool = getTool(id, dirs);
    opslog.info('tool-updated', 'tool updated: ' + id, { tool: id });
    return { ok: true, tool: tool };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = {
  scanTools: scanTools,
  getTool: getTool,
  findManifest: findManifest,
  startTool: startTool,
  stopTool: stopTool,
  createTool: createTool,
  updateTool: updateTool
};
