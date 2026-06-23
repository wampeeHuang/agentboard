// lib/crash-guard.js — 通用防猝死保护
// tool-registry 检测到 node 命令自动注入 -r 预加载
// 所有 node 工具无需各自添加，统一受保护
var path = require('path');
var opslog = require('./ops-log');

var TOOL_NAME = process.env.AGENTBOARD_TOOL_NAME || path.basename(process.argv[1] || 'unknown');

process.on('uncaughtException', function(err) {
  opslog.emit('tool-crash', TOOL_NAME + ': ' + err.message, { tool: TOOL_NAME, stack: (err.stack || '').slice(0, 500) });
  console.error('[crash-guard] ' + TOOL_NAME + ' uncaughtException:', err.message);
});

process.on('unhandledRejection', function(reason) {
  var msg = reason instanceof Error ? reason.message : String(reason);
  opslog.emit('tool-rejection', TOOL_NAME + ': ' + msg, { tool: TOOL_NAME });
  console.error('[crash-guard] ' + TOOL_NAME + ' unhandledRejection:', msg);
});

opslog.emit('tool-guard-active', 'crash guard initialized for ' + TOOL_NAME, { tool: TOOL_NAME });
