// lib/ops-log.js — 运维日志：JSONL 环形缓冲区
// agent 巡检通过 /health 读摘要，需要详情直接 Read 磁盘

var fs = require('fs');
var path = require('path');
var LOG = path.join(__dirname, '..', '_runtime', 'events.jsonl');
var MAX = 1000;

function emit(event, msg, extra) {
  var dir = path.dirname(LOG);
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  var entry = { ts: new Date().toISOString(), event: event, msg: msg, pid: process.pid };
  if (extra) Object.keys(extra).forEach(function(k) { entry[k] = extra[k]; });
  var line = JSON.stringify(entry) + '\n';
  try { fs.appendFileSync(LOG, line); } catch (_) {}
  try {
    var raw = fs.readFileSync(LOG, 'utf8').trim();
    var lines = raw ? raw.split('\n') : [];
    if (lines.length > MAX) fs.writeFileSync(LOG, lines.slice(-MAX).join('\n') + '\n');
  } catch (_) {}
}

function info(event, msg, extra)  { emit(event, msg, extra); }
function error(event, msg, extra) { emit(event, msg, extra); }

module.exports = { emit: emit, info: info, error: error, LOG_PATH: LOG };
