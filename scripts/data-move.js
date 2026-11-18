#!/usr/bin/env node
// scripts/data-move.js — 把当前数据包整体复制到新路径，并切换应用的当前数据包指针。
// 用法：
//   node scripts/data-move.js <目标目录> [--dry-run]
//   npm run data:move -- D:\AgentboardData
// 说明：先停 dashboard；脚本只复制数据包、不删除旧数据；验证新路径后再自行清理旧数据/备份。
var fs = require('fs');
var path = require('path');
var http = require('http');
var paths = require('../lib/paths');

var args = process.argv.slice(2);
var dryRun = args.indexOf('--dry-run') !== -1;
var targetArg = args.filter(function (a) { return a !== '--dry-run'; })[0];

function fail(msg) {
  console.error('[data-move] ' + msg);
  process.exit(1);
}

if (!targetArg) fail('缺少目标目录。用法: node scripts/data-move.js <目标目录> [--dry-run]');

var current = path.resolve(paths.DATA_ROOT);
var target = path.resolve(targetArg);

if (target === current) fail('目标目录与当前数据根相同');
var rel = path.relative(current, target);
if (rel && rel.indexOf('..') !== 0 && !path.isAbsolute(rel)) fail('目标目录不能位于当前数据包内部');
var rel2 = path.relative(target, current);
if (rel2 && rel2.indexOf('..') !== 0 && !path.isAbsolute(rel2)) fail('目标目录不能是当前数据包的父目录');

if (!fs.existsSync(current)) fail('当前数据根不存在: ' + current);
if (!fs.existsSync(path.join(current, 'agentboard-data.json'))) {
  fail('当前数据根缺少 agentboard-data.json，先完成数据包迁移: ' + current);
}

function checkServer(cb) {
  var req = http.get({ host: '127.0.0.1', port: 3099, path: '/api/boundary', timeout: 1500 }, function (res) {
    res.resume();
    cb(true);
  });
  req.on('timeout', function () { req.destroy(); cb(false); });
  req.on('error', function () { cb(false); });
}

checkServer(function (running) {
  if (running) fail('dashboard 正在运行，请先停止（Supervisor /api/stop dashboard）再搬迁数据');
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) fail('目标目录已存在且非空: ' + target);

  var files = 0;
  var bytes = 0;
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { files++; bytes += fs.statSync(full).size; }
    });
  })(current);

  console.log('[data-move] current=' + current);
  console.log('[data-move] target=' + target);
  console.log('[data-move] files=' + files + ' bytes=' + bytes);
  if (dryRun) {
    console.log('[data-move] dry-run: 未复制、未改指针');
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(current, target, { recursive: true, force: false, errorOnExist: true });
  var copied = 0;
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) copied++;
    });
  })(target);
  if (copied !== files) fail('复制文件数不一致: source=' + files + ' target=' + copied);

  var config = { dataRoot: target };
  fs.writeFileSync(paths.CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[data-move] copied files=' + copied);
  console.log('[data-move] pointer updated: ' + paths.CONFIG_FILE);
  console.log('[data-move] 旧数据仍保留在 ' + current + '；验证新数据后再清理');
  console.log('[data-move] 启动 dashboard 后检查 /api/boundary 的 dataRoot 应为 ' + target);
});
