#!/usr/bin/env node
// scripts/init-data.js — 初始化用户数据根，不覆盖任何已有数据
// 应用代码（APP_ROOT）与用户数据（DATA_ROOT）分离；本脚本只补齐目录和示例。
var fs = require('fs');
var path = require('path');
var paths = require('../lib/paths');

function copyIfMissing(src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function main() {
  paths.ensureDataDirs();
  var copied = [];

  // 内容契约：数据根没有时从应用仓库复制一份；已有文件绝不覆盖
  [
    ['apps/CONSTITUTION.md', path.join(paths.APPS_DIR, 'CONSTITUTION.md')],
    ['tips/CONSTITUTION.md', path.join(paths.TIPS_DIR, 'CONSTITUTION.md')],
    ['principles/CONSTITUTION.md', path.join(paths.PRINCIPLES_DIR, 'CONSTITUTION.md')]
  ].forEach(function (pair) {
    if (copyIfMissing(path.join(paths.APP_ROOT, pair[0]), pair[1])) copied.push(pair[0]);
  });

  // 示例工具：仅在目标不存在时复制
  var examplesTools = path.join(paths.APP_ROOT, 'examples');
  if (fs.existsSync(examplesTools)) {
    fs.readdirSync(examplesTools, { withFileTypes: true }).forEach(function (entry) {
      if (!entry.isDirectory()) return;
      var src = path.join(examplesTools, entry.name, 'manifest.json');
      var dest = path.join(paths.TOOLS_DIR, entry.name, 'manifest.json');
      if (copyIfMissing(src, dest)) copied.push('examples/' + entry.name);
    });
  }

  console.log('Agentboard data initialized');
  console.log('  app : ' + paths.APP_ROOT);
  console.log('  data: ' + paths.DATA_ROOT);
  console.log(copied.length ? '  copied: ' + copied.join(', ') : '  copied: nothing (existing data preserved)');
  console.log('  next: npm start  → http://localhost:' + (process.env.PORT || '3099'));
}

main();
