const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');
var registry = require('./lib/tool-registry');
var opslog = require('./lib/ops-log');

var serverStartTime = Date.now();
var EVENTS_LOG = path.join(__dirname, '_runtime', 'events.jsonl');

function getHealth() {
  var now = Date.now();
  var lines = [];
  try {
    var raw = fs.readFileSync(EVENTS_LOG, 'utf8');
    if (raw.trim()) lines = raw.trim().split('\n').map(function(l) {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {}

  var crashes24h = lines.filter(function(e) {
    return (now - new Date(e.ts).getTime()) < 86400000 &&
      (e.event === 'tool-crash' || e.event === 'tool-rejection' || e.event === 'tool-spawn-error');
  }).length;

  var seenPids = {};
  var abnormalDeaths = [];
  for (var i = 0; i < lines.length; i++) {
    var entry = lines[i];
    if (entry.event === 'server-start' && entry.pid && !seenPids[entry.pid]) {
      seenPids[entry.pid] = true;
      if (entry.pid === process.pid) continue;
      var hadActivity = false, hadCrash = false;
      for (var j = i + 1; j < lines.length; j++) {
        if (lines[j].event === 'server-start') break;
        if (lines[j].pid === entry.pid) hadActivity = true;
        if (lines[j].event === 'tool-crash' || lines[j].event === 'tool-rejection') hadCrash = true;
      }
      if (!hadActivity && !hadCrash) continue;
      if (!hadCrash) {
        var deathTs = '';
        for (var k = i + 1; k < lines.length; k++) {
          if (lines[k].event === 'server-start' && lines[k].pid !== entry.pid) { deathTs = lines[k].ts; break; }
        }
        abnormalDeaths.push({ pid: entry.pid, startedAt: entry.ts, presumedDeadAt: deathTs || 'unknown' });
      }
    }
  }

  var lastEvent = lines.length > 0 ? lines[lines.length - 1] : null;
  return {
    status: crashes24h > 0 ? 'degraded' : 'ok',
    pid: process.pid,
    uptime: Math.round((now - serverStartTime) / 1000),
    totalLines: lines.length,
    crashes24h: crashes24h,
    abnormalDeaths: abnormalDeaths,
    snapshot: {
      totalEvents: lines.length,
      events24h: lines.filter(function(e) { return (now - new Date(e.ts).getTime()) < 86400000; }).length,
      crashes24h: crashes24h,
      lastEvent: lastEvent ? lastEvent.event : null,
      lastEventTs: lastEvent ? lastEvent.ts : null
    }
  };
}

const PROJECT_DIR = __dirname;
const AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(os.homedir(), '.agentboard');
const TOOLS_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
const TOOLS_DIRS = [TOOLS_DIR];
const SKILLS_DIR = process.env.AGENTBOARD_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
var apiHTML = require('./lib/api-page');
const TIPS_DIR = process.env.AGENTBOARD_TIPS_DIR || path.join(AGENTBOARD_HOME, 'tips');
const PRINCIPLES_DIR = process.env.AGENTBOARD_PRINCIPLES_DIR || path.join(AGENTBOARD_HOME, 'principles');
const LOCAL_SKILLS_DIR = path.join(PROJECT_DIR, 'skills');
const PREFERRED_PORT = parseInt(process.env.PORT || '3099', 10);
const PLATFORM = process.platform;

function read(p) { try { return fs.readFileSync(p,'utf8'); } catch(_) { return null; } }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function monogram(name) { var s = (name||'').trim(); var en = s.match(/[A-Za-z][A-Za-z\s]+/); if (en) { var w = en[0].split(/\s+/).filter(Boolean); if (w.length >= 2) return (w[0][0] + w[w.length-1][0]).toUpperCase(); if (w.length === 1 && w[0].length >= 2) return w[0].substring(0,2).toUpperCase(); } var cn = s.replace(/[^一-鿿]/g,''); if (cn.length >= 2) return cn[0] + cn[cn.length-1]; var ascii = s.replace(/[^A-Za-z0-9]/g,''); if (ascii.length >= 2) return ascii.substring(0,2).toUpperCase(); return (s.substring(0,2) || '??').toUpperCase(); }
function listDirs(p) { try { return fs.readdirSync(p).filter(function(name){ if (name.charAt(0) === '.') return false; try { return fs.statSync(path.join(p, name)).isDirectory(); } catch(_) { return false; } }); } catch(_) { return []; } }
function openFolder(p) { try { exec('start "" "' + p + '"'); } catch(_) {} }

function safeResolve(base, ...segments) {
  const resolved = path.resolve(path.join(base, ...segments));
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    return null;
  }
  return resolved;
}

// Normalize MSYS2 paths (/d/foo → D:\foo) for Node fs on Windows
function winPath(p) {
  const m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}


function renderMarkdown(md, opts) {
  opts = opts || {};
  var keepH1 = opts.keepH1 !== false;
  var body = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!keepH1) body = body.replace(/^#\s+.*\n/, '');
  var codeBlocks = [];
  body = body.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    codeBlocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
    return '\u0000CODE' + (codeBlocks.length - 1) + '\u0000';
  });
  body = body.replace(/`([^`]+)`/g, '<code>$1</code>');
  body = body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  body = body.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  body = body.replace(/^### (.+)/gm, '<h3>$1</h3>');
  body = body.replace(/^## (.+)/gm, '<h2>$1</h2>');
  if (keepH1) body = body.replace(/^# (.+)/gm, '<h1>$1</h1>');
  body = body.replace(/^- (.+)/gm, '<li>$1</li>');
  body = body.replace(/(<li>.*<\/li>\n?)+/g, function(m) { return '<ul>' + m.replace(/\s+$/, '') + '</ul>'; });
  body = body.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
  body = body.replace(/<p>\s*<\/p>/g, '');
  body = body.replace(/<p>\u0000CODE(\d+)\u0000<\/p>/g, function(_, i) { return codeBlocks[+i]; });
  body = body.replace(/\u0000CODE(\d+)\u0000/g, function(_, i) { return codeBlocks[+i]; });
  return body;
}

function scanTools() { return registry.scanTools(TOOLS_DIRS); }
function findManifest(id) { return registry.findManifest(id, TOOLS_DIRS); }
function startTool(id) { return registry.startTool(id, TOOLS_DIRS); }
function stopTool(id) { return registry.stopTool(id, TOOLS_DIRS); }
function createTool(body) { return registry.createTool(body, TOOLS_DIRS); }
function updateTool(id, body) { return registry.updateTool(id, body, TOOLS_DIRS); }

function startServer() {
  const app = express();
  app.use(express.json());

  // --- request logging (in-memory + file, date-partitioned) ---
  var LOGS_DIR = path.join(AGENTBOARD_HOME, 'state', 'api-calls');
  var apiLog = []; // [{ts, method, path, ua, caller, action, target}]
  var apiCounts = {}; // { '/api/tools': {count, first, last}, ... }
  try { fs.mkdirSync(LOGS_DIR, {recursive:true}); } catch(_) {}

  function todayLogPath() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var dir = path.join(LOGS_DIR, yyyy + '-' + mm);
    try { fs.mkdirSync(dir, {recursive:true}); } catch(_) {}
    return path.join(dir, dd + '.jsonl');
  }

  // migrate legacy flat file
  var OLD_LOG = path.join(AGENTBOARD_HOME, 'state', 'api-calls.jsonl');
  if (fs.existsSync(OLD_LOG)) {
    try {
      var oldContent = read(OLD_LOG);
      if (oldContent && oldContent.trim()) {
        var oldLines = oldContent.trim().split('\n');
        for (var oi = 0; oi < oldLines.length; oi++) {
          try {
            var oe = JSON.parse(oldLines[oi]);
            if (oe && oe.ts) {
              var d = new Date(oe.ts);
              var yyyy = d.getFullYear();
              var mm = String(d.getMonth() + 1).padStart(2, '0');
              var dd = String(d.getDate()).padStart(2, '0');
              var mdir = path.join(LOGS_DIR, yyyy + '-' + mm);
              try { fs.mkdirSync(mdir, {recursive:true}); } catch(_) {}
              fs.appendFileSync(path.join(mdir, dd + '.jsonl'), JSON.stringify(oe) + '\n', 'utf8');
            }
          } catch(_) {}
        }
      }
      fs.unlinkSync(OLD_LOG);
    } catch(_) {}
  }

  // classify: who called
  function classifyCaller(ua) {
    if (!ua) return 'unknown';
    if (/curl|axios|node-fetch|python-requests|httpie/i.test(ua)) return 'agent';
    if (/Mozilla.*(Chrome|Firefox|Safari|Edge)/i.test(ua)) return 'browser';
    if (/Java|Go-http|Ruby/i.test(ua)) return 'agent';
    return 'unknown';
  }

  // classify: what kind of operation
  function classifyAction(method, path) {
    if (path === '/api/tools' && method === 'GET') return 'list';
    if (/^\/api\/tools\/[^/]+$/.test(path) && method === 'GET') return 'detail';
    if (/^\/api\/tools\/(start|stop)\//.test(path) && method === 'POST') return 'control';
    if (path === '/api/tools/reorder' && method === 'POST') return 'control';
    if (path === '/api/stats' && method === 'GET') return 'admin';
    if (path === '/api/tips' || path.startsWith('/api/tips/')) return 'admin';
    return 'admin';
  }

  // extract tool id from path: /api/tools/start/forma → forma
  function classifyTarget(path) {
    var m = path.match(/^\/api\/tools\/(?:start|stop)\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = path.match(/^\/api\/tools\/([a-zA-Z0-9_-]+)$/);
    if (m && m[1] !== 'reorder') return m[1];
    return null;
  }

  // load all date-partitioned logs
  try {
    var months = listDirs(LOGS_DIR);
    months.forEach(function(mo) {
      var mdir = path.join(LOGS_DIR, mo);
      var days = fs.readdirSync(mdir).filter(function(f) { return f.endsWith('.jsonl'); });
      days.forEach(function(day) {
        var content = read(path.join(mdir, day));
        if (!content) return;
        var lines = content.trim().split('\n');
        for (var li = 0; li < lines.length; li++) {
          try { var entry = JSON.parse(lines[li]); if (entry) apiLog.push(entry); } catch(_) {}
        }
      });
    });
  } catch(_) {}

  // rebuild counts from log
  for (var ai = 0; ai < apiLog.length; ai++) {
    var e = apiLog[ai]; var k = (e.method||'GET') + ' ' + (e.path||'/');
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: e.ts, last: e.ts };
    apiCounts[k].count++; apiCounts[k].last = e.ts;
    if (!e.caller) e.caller = classifyCaller(e.ua||'');
    if (!e.action) e.action = classifyAction(e.method||'GET', e.path||'/');
    if (!e.target) e.target = classifyTarget(e.path||'/');
  }

  function logApiCall(method, p, ua, statusCode) {
    var entry = {
      ts: new Date().toISOString(),
      method: method, path: p,
      status: statusCode || 0,
      ua: (ua||'').slice(0, 120),
      caller: classifyCaller(ua||''),
      action: classifyAction(method, p),
      target: classifyTarget(p)
    };
    apiLog.push(entry);
    var k = method + ' ' + p;
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: entry.ts, last: entry.ts };
    apiCounts[k].count++; apiCounts[k].last = entry.ts;
    try { fs.appendFileSync(todayLogPath(), JSON.stringify(entry) + '\n', 'utf8'); } catch(_) {}
  }
  app.use(function(req, res, next) {
    if (req.path.startsWith('/api/')) {
      res.on('finish', function() {
        logApiCall(req.method, req.path, req.get('user-agent')||'', res.statusCode);
      });
    }
    next();
  });



  // shared context for route/static modules (module-level helpers + closure logging state)
  var ctx = { read: read, esc: esc, monogram: monogram, listDirs: listDirs, openFolder: openFolder, safeResolve: safeResolve, renderMarkdown: renderMarkdown, scanTools: scanTools, findManifest: findManifest, startTool: startTool, stopTool: stopTool, createTool: createTool, updateTool: updateTool, getHealth: getHealth, apiHTML: apiHTML, registry: registry, TOOLS_DIR: TOOLS_DIR, SKILLS_DIR: SKILLS_DIR, TIPS_DIR: TIPS_DIR, PRINCIPLES_DIR: PRINCIPLES_DIR, LOCAL_SKILLS_DIR: LOCAL_SKILLS_DIR, PROJECT_DIR: PROJECT_DIR, apiLog: apiLog, apiCounts: apiCounts };

  // routes (REST API + content)
  require('./lib/routes')(app, ctx);

  // home + static (web/)
  require('./lib/static')(app, ctx);

  // MCP Streamable HTTP
  require('./lib/mcp-http')(app);
  process.on('uncaughtException', function(err) {
    opslog.error('uncaughtException', (err && err.message) || String(err), { stack: err && err.stack });
    console.error('[agentboard] uncaughtException:', err && err.stack || err);
    // EADDRINUSE 致命——退出，让守护者（Supervisor）重启，避免僵尸进程占端口
    if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
      process.exit(1);
    }
  });
  process.on('unhandledRejection', function(reason) {
    var msg = (reason && reason.message) || String(reason);
    opslog.error('unhandledRejection', msg, { stack: reason && reason.stack });
    console.error('[agentboard] unhandledRejection:', reason && reason.stack || reason);
  });

  var PORT = process.env.PORT || 3099;
  // 绑定回环：不绑 0.0.0.0，局域网不可达（Local-first）
  app.listen(PORT, '127.0.0.1', function() {
    opslog.info('server-start', 'server started', { port: PORT, host: '127.0.0.1', pid: process.pid });
    console.log('Agentboard http://localhost:' + PORT);
  });

  // self-check: die fast so supervisor can resurrect
  require('./lib/self-check').start();
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer: startServer };