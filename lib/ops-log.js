// lib/ops-log.js — 运维日志：JSONL 环形缓冲区
// server.js 和 mcp-server.js 共享。agent 巡检通过 /health 读摘要，需要详情直接 Read 磁盘文件

var fs = require('fs');
var path = require('path');
var os = require('os');

var PROJECT_DIR = path.join(os.homedir(), '.agentboard');
var LOG_PATH = path.join(PROJECT_DIR, '_runtime', 'ops-log.jsonl');
var MAX_LINES = parseInt(process.env.OPS_LOG_MAX_LINES || '1000', 10);
var _startTime = Date.now();

function ensureDir() {
  var dir = path.dirname(LOG_PATH);
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function _readAll() {
  ensureDir();
  try {
    var raw = fs.readFileSync(LOG_PATH, 'utf8');
    if (!raw.trim()) return [];
    return raw.trim().split('\n').map(function(line) {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}

function _writeAll(lines) {
  ensureDir();
  var content = lines.map(function(e) { return JSON.stringify(e); }).join('\n') + '\n';
  try { fs.writeFileSync(LOG_PATH, content, 'utf8'); } catch (_) {}
}

// 追加 + 同步裁旧。同步读写 1000 行 JSONL (~200KB) < 5ms，不阻塞事件循环
function log(level, event, msg, extra) {
  ensureDir();
  var entry = {
    ts: new Date().toISOString(),
    level: level,
    event: event,
    msg: msg,
    pid: process.pid
  };
  if (extra) {
    Object.keys(extra).forEach(function(k) { entry[k] = extra[k]; });
  }

  var line = JSON.stringify(entry) + '\n';
  try { fs.appendFileSync(LOG_PATH, line, 'utf8'); } catch (_) {
    // append 失败时尝试全量写入
    try {
      var all = _readAll();
      all.push(entry);
      _writeAll(all);
    } catch (_) {}
  }

  // 同步裁旧
  try {
    var raw = fs.readFileSync(LOG_PATH, 'utf8');
    var lines = raw.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length > MAX_LINES) {
      fs.writeFileSync(LOG_PATH, lines.slice(lines.length - MAX_LINES).join('\n') + '\n', 'utf8');
    }
  } catch (_) {}
}

function info(event, msg, extra)  { log('info', event, msg, extra); }
function warn(event, msg, extra)  { log('warn', event, msg, extra); }
function error(event, msg, extra) { log('error', event, msg, extra); }

// 读最近 N 条
function recent(n, filter) {
  var all = _readAll();
  if (filter) {
    if (filter.level) all = all.filter(function(e) { return e.level === filter.level; });
    if (filter.event) all = all.filter(function(e) { return e.event === filter.event; });
    if (filter.since)  all = all.filter(function(e) { return e.ts >= filter.since; });
  }
  var count = n || 100;
  return all.slice(-count);
}

// 健康摘要。uptime 从日志第一条 start 事件的时间戳算（跨重启可追溯），
// 当前进程没写 start 时退回到进程存活时长。
function health() {
  var all = _readAll();
  var now = Date.now();

  // 找最后一次 'start' 事件来算服务存活时长（非进程存活时长）
  var serviceUptime = 0;
  for (var i = all.length - 1; i >= 0; i--) {
    if (all[i].event === 'start') {
      serviceUptime = Math.round((now - new Date(all[i].ts).getTime()) / 1000);
      break;
    }
  }
  if (!serviceUptime) {
    serviceUptime = Math.round((now - _startTime) / 1000);
  }

  var last24h = all.filter(function(e) { return (now - new Date(e.ts).getTime()) < 86400000; });
  var errors = last24h.filter(function(e) { return e.level === 'error'; });
  var crashes = errors.filter(function(e) {
    return e.event === 'crash' || e.event === 'uncaughtException' || e.event === 'unhandledRejection';
  });

  // 非正常终止检测：进程 PID 变了但 crash 日志里没有记录
  var abnormalDeaths = [];
  var seenPids = {};
  for (var j = 0; j < all.length; j++) {
    var entry = all[j];
    if (entry.event === 'start' && entry.pid && !seenPids[entry.pid]) {
      seenPids[entry.pid] = true;
      // 检查这个 PID 是否以 crash 结尾
      var hadCrash = false;
      for (var k = j + 1; k < all.length; k++) {
        if (all[k].event === 'start') break;
        if (all[k].level === 'error' && (all[k].event === 'crash' || all[k].event === 'uncaughtException' || all[k].event === 'unhandledRejection')) {
          hadCrash = true; break;
        }
      }
      if (!hadCrash && entry.pid !== process.pid) {
        // 前一个进程没有 crash 记录但已经不在了 → 非正常死亡
        var deathTs = '';
        for (var k2 = j + 1; k2 < all.length; k2++) {
          if (all[k2].event === 'start' && all[k2].pid !== entry.pid) {
            deathTs = all[k2].ts; break;
          }
        }
        abnormalDeaths.push({ pid: entry.pid, startedAt: entry.ts, presumedDeadAt: deathTs || 'unknown' });
      }
    }
  }

  var byEvent = {};
  errors.forEach(function(e) { byEvent[e.event] = (byEvent[e.event] || 0) + 1; });

  return {
    status: crashes.length > 0 ? 'degraded' : 'ok',
    uptime: serviceUptime,
    pid: process.pid,
    totalLines: all.length,
    errors24h: errors.length,
    crashes24h: crashes.length,
    lastCrash: crashes.length ? crashes[crashes.length - 1].ts : null,
    errorBreakdown: byEvent,
    abnormalDeaths: abnormalDeaths,
    maxLines: MAX_LINES
  };
}

module.exports = { log: log, info: info, warn: warn, error: error, recent: recent, health: health, LOG_PATH: LOG_PATH };
