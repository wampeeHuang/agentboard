// lib/tree-drift.js — 目录树漂移审计：三棵树（agent.md / README / docs/使用说明书.html）列出的文件必须真实存在，
// 且 lib/ + web/ 的真实文件必须全部入树（双向）。
// 漂移类：加了路由/模块没更新树 = 文件在但树没列；删了文件树还挂着 = 树列了但文件没了。
// 契约树（agent.md）不可读 → 报错失败，不静默通过。
var fs = require('fs');
var path = require('path');

var PROJECT = path.join(__dirname, '..');

function treeSources() {
  return [
    { name: 'agent.md', path: path.join(PROJECT, 'agent.md') },
    { name: 'README.md', path: path.join(PROJECT, 'README.md') },
    { name: '使用说明书.html', path: path.join(PROJECT, 'docs', '使用说明书.html') }
  ];
}

function readTree(file) {
  var t = fs.readFileSync(file, 'utf8');
  if (path.extname(file) === '.html') {
    var m = t.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    var block = m ? m[1].replace(/<\/?span[^>]*>/g, '') : '';
    return block.split('（省略').shift();
  }
  var f = t.match(/```\n([\s\S]*?)\n```/);
  var b = f ? f[1] : t;
  return b.split('（省略').shift();
}

// 注释里像文件名的词会污染（例：nextjs-app 的注释「Next.js 示例」）；家目录前缀 ~/.agentboard ~/.claude 不是本项目子目录
var NOISE = { 'Next.js': 1, 'agentboard': 1, 'claude': 1 };

function tokenize(block) {
  var tokens = new Set();
  var re = /[一-龥A-Za-z0-9_][一-龥A-Za-z0-9._-]*\.(?:js|mjs|css|html|md|json|jsonl|svg|ico|txt|otf|ttf)\b/g;
  var m;
  while ((m = re.exec(block))) {
    var tok = m[0];
    if (!NOISE[tok] && tok[0] !== '{' && tok[0] !== '*') tokens.add(tok);
  }
  var re2 = /\b([一-龥A-Za-z0-9_][一-龥A-Za-z0-9._-]*)\/\s/g;
  while ((m = re2.exec(block))) {
    var d = m[1];
    if (!NOISE[d] && d !== '..' && d[0] !== '*') tokens.add(d);
  }
  return tokens;
}

function walk(dir, out) {
  var entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return; }
  entries.forEach(function(en) {
    var full = path.join(dir, en);
    var st;
    try { st = fs.statSync(full); } catch (e) { return; }
    if (st.isDirectory()) { out.add(en); walk(full, out); }
    else out.add(en);
  });
}

function auditTree() {
  var issues = [];
  var srcs = treeSources();
  var tokens = new Set();
  var tokenOwners = {};

  srcs.forEach(function(src) {
    var block;
    try { block = readTree(src.path); } catch (e) {
      issues.push(src.name + ' 树不可读: ' + e.message);
      return;
    }
    tokenize(block).forEach(function(t) {
      tokens.add(t);
      (tokenOwners[t] = tokenOwners[t] || []).push(src.name);
    });
  });

  // 真源全集（lib/ + web/ 双向，其余目录只验「列出的存在」）
  var disk = new Set();
  walk(path.join(PROJECT, 'lib'), disk);
  walk(path.join(PROJECT, 'web'), disk);
  walk(path.join(PROJECT, 'docs'), disk);
  walk(path.join(PROJECT, 'principles'), disk);
  walk(path.join(PROJECT, 'mechanisms'), disk);
  walk(path.join(PROJECT, 'examples'), disk);
  walk(path.join(PROJECT, 'state'), disk);
  walk(path.join(PROJECT, 'tools'), disk);
  walk(path.join(PROJECT, 'tips'), disk);
  walk(PROJECT, disk);
  walk(path.join(PROJECT, '.claude'), disk);

  // ① 树列了但磁盘不存在 → 删了文件树还挂着
  tokens.forEach(function(t) {
    if (!disk.has(t)) issues.push('树列了磁盘没有: ' + t + ' (源: ' + tokenOwners[t].join('/') + ') — 删除或迁移后树未更新');
  });

  // ② lib/ + web/ 真实文件没入树 → 加了模块树没列（三棵树都要列）
  var governed = ['lib', 'web'].map(function(d) { return path.join(PROJECT, d); });
  governed.forEach(function(dir) {
    var name = path.basename(dir);
    var files;
    try { files = fs.readdirSync(dir); } catch (e) { return; }
    files.forEach(function(f) {
      if (!tokens.has(f)) issues.push(name + '/' + f + ' 在磁盘但三棵树都没列 — 加模块后树未同步');
    });
  });

  return { ok: issues.length === 0, total: tokens.size, errors: issues.length, issues: issues };
}

module.exports = { auditTree: auditTree, treeSources: treeSources };
