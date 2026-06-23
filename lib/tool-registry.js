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
var CACHE_TTL = 500;

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
    }
  } catch (_) {}
  _portsCache = ports;
  _portsCacheTime = now;
  return ports;
}

function isPortActive(port) {
  return getListeningPorts().has(port);
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

      // 从项目 index.html 补充名称和描述
      if (mf.projectPath) {
        var meta = extractMeta(mf.projectPath);
        if (!mf.name && meta._name) mf.name = meta._name;
        if (!mf.description && meta._desc) mf.description = meta._desc;
      }

      var ports = mf.ports || (mf.port ? [mf.port] : []);
      var running = ports.length > 0 ? ports.every(function (p) { return isPortActive(p); }) : null;

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
        dashboard: mf.dashboard || null
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
    opslog.info('tool-start', 'tool started: ' + id, { tool: id, port: mf.port });
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
  try {
    child_process.execSync(mf.stopCommand, { timeout: 10000, encoding: 'utf8', shell: true, windowsHide: true });
    opslog.info('tool-stop', 'tool stopped: ' + id, { tool: id });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── 共享字段定义 ──

var BASE_FIELDS = ['description', 'icon', 'version', 'category', 'order', 'port', 'ports', 'projectPath', 'url', 'startCommand', 'stopCommand', 'publicUrl', 'owner', 'apiBase', 'type', 'trigger', 'agent_notes', 'capability', 'dashboard'];

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
