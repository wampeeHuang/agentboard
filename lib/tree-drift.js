// lib/tree-drift.js — 目录树漂移审计：三棵树（AGENT.md / README / docs/使用说明书.html）与磁盘双向核对。
// 检测到漂移时按「文档 → 段 → 条目」给落位指导（fix 数组），供人或 agent 照着修，不自动改写文件。
// 漂移类：加了路由/模块没更新树 = 文件在但树没列；删了文件树还挂着 = 树列了但文件没了。
// 契约树（AGENT.md）不可读 → 报错失败，不静默通过。
var fs = require('fs');
var path = require('path');

var PROJECT = path.join(__dirname, '..');

function treeSources() {
  return [
    { name: 'AGENT.md', path: path.join(PROJECT, 'AGENT.md'), scope: ['lib', 'web'] },
    { name: 'README.md', path: path.join(PROJECT, 'README.md'), scope: ['lib', 'web'] },
    { name: '使用说明书.html', path: path.join(PROJECT, 'docs', '使用说明书.html'), scope: ['lib', 'web', 'docs', 'mechanisms', 'examples'] }
  ];
}

function readTree(file) {
  var t = fs.readFileSync(file, 'utf8');
  if (path.extname(file) === '.html') {
    var m = t.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    var block = m ? m[1].replace(/<\/?span[^>]*>/g, '') : '';
    return block.split('（省略').shift();
  }
  // 取含目录树（├──）的代码块；README 首个 ``` 是 bash 示例，不能当树
  var blocks = t.match(/```[^\n]*\n([\s\S]*?)```/g) || [];
  var b = null;
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].indexOf('├──') !== -1) { b = blocks[i].replace(/```[^\n]*\n?/, '').replace(/```$/, ''); break; }
  }
  if (b === null) b = t;
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

// 只跳树里不记载、且体量大的重目录；tools/tips/state/_runtime 是树里合法条目，必须走查
var SKIP_DIRS = { node_modules: 1, '.git': 1, coverage: 1 };

function diskEntries() {
  var set = new Set();
  (function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return; }
    entries.forEach(function(en) {
      var full = path.join(dir, en);
      var st;
      try { st = fs.statSync(full); } catch (e) { return; }
      if (st.isDirectory()) {
        if (SKIP_DIRS[en]) return;
        set.add(en); walk(full);
      } else set.add(en);
    });
  })(PROJECT);
  return set;
}

function auditTree() {
  var issues = [];
  var fixes = [];
  var items = [];
  var disk = diskEntries();

  treeSources().forEach(function(src) {
    var block, tokens;
    try { block = readTree(src.path); tokens = tokenize(block); } catch (e) {
      issues.push(src.name + ' 树不可读: ' + e.message);
      return;
    }

    // ① 该文档列了、磁盘没有 → 删掉对应行
    tokens.forEach(function(t) {
      if (!disk.has(t)) {
        issues.push(src.name + '：树列了磁盘没有「' + t + '」— 删除或迁移后树未更新，删掉该条目行');
        fixes.push({ doc: src.name, action: 'remove', entry: t });
        items.push({ doc: src.name, check: '树条目', entry: t, pass: false, detail: '树列了磁盘没有' });
      } else {
        items.push({ doc: src.name, check: '树条目', entry: t, pass: true, detail: '磁盘存在' });
      }
    });

    // ② 该文档该列的段缺了真实文件 → 补一行
    src.scope.forEach(function(dir) {
      var files;
      try { files = fs.readdirSync(path.join(PROJECT, dir)); } catch (e) { return; }
      files.forEach(function(f) {
        if (!tokens.has(f)) {
          issues.push(src.name + '：缺「' + dir + '/' + f + '」— 文件在磁盘但树没列，在 ' + dir + '/ 段补一行');
          fixes.push({ doc: src.name, action: 'add', section: dir, entry: f });
          items.push({ doc: src.name, check: '目录' + dir, entry: dir + '/' + f, pass: false, detail: '文件在磁盘但树没列' });
        } else {
          items.push({ doc: src.name, check: '目录' + dir, entry: dir + '/' + f, pass: true, detail: '树已列出' });
        }
      });
    });
  });

  return { ok: issues.length === 0, total: items.length, errors: issues.length, issues: issues, fixes: fixes, items: items };
}

module.exports = { auditTree: auditTree, treeSources: treeSources };
