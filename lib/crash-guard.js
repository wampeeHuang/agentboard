// lib/crash-guard.js — 通用防猝死保护
// tool-registry 检测到 node 命令自动注入 -r 预加载
// 所有 node 工具无需各自添加，统一受保护

var fs = require('fs');
var path = require('path');
var os = require('os');

var OPS_LOG = path.join(os.homedir(), '.agentboard', '_runtime', 'ops-log.jsonl');
var TOOL_NAME = process.env.AGENTBOARD_TOOL_NAME || path.basename(process.argv[1] || 'unknown');

function opslog(level, event, msg, extra) {
  var entry = { ts: new Date().toISOString(), level: level, event: event, msg: msg, pid: process.pid, tool: TOOL_NAME };
  if (extra) Object.keys(extra).forEach(function(k) { entry[k] = extra[k]; });
  try { fs.appendFileSync(OPS_LOG, JSON.stringify(entry) + '\n', 'utf8'); } catch (_) {}
}

process.on('uncaughtException', function(err) {
  opslog('error', 'tool-crash', err.message, { stack: (err.stack || '').slice(0, 500) });
  console.error('[crash-guard] ' + TOOL_NAME + ' uncaughtException:', err.message);
});

process.on('unhandledRejection', function(reason) {
  var msg = reason instanceof Error ? reason.message : String(reason);
  opslog('error', 'tool-rejection', msg);
  console.error('[crash-guard] ' + TOOL_NAME + ' unhandledRejection:', msg);
});

opslog('info', 'tool-guard-active', 'crash guard initialized');
