// lib/docs-fresh.js — 文档新鲜度审计：页面清单/页数四处手写（说明书、AGENT.md、README、index.html 注释），无单源必漂。
// PAGES 是页面唯一真相源。新增页面 = 改 PAGES + 同步四处文档；审计兜住漏同步，按「文档 → 段 → 条目」给落位指导，不自动改写。
// 漂移类：加了页面没同步文档 = 缺页面条目/页数不符；index.html AI 参考注释漏登记页面。
var fs = require('fs');
var path = require('path');

var PROJECT = path.join(__dirname, '..');

var PAGES = [
  { id: 'tools', label: '工具架' },
  { id: 'capabilities', label: '能力地图' },
  { id: 'apps', label: '我的网站' },
  { id: 'tips', label: '经验日志' },
  { id: 'principles', label: '原则库' },
  { id: 'audit', label: '治理审计' },
  { id: 'docs', label: '说明书' }
];

var DOCS = [
  { name: 'AGENT.md', file: path.join(PROJECT, 'AGENT.md') },
  { name: 'README.md', file: path.join(PROJECT, 'README.md') },
  { name: '使用说明书.html', file: path.join(PROJECT, 'docs', '使用说明书.html') }
];

function readSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}

// 检查① 说明书「打开工具架」段 .pg 块：每页 label 都在，且条目数 == PAGES.length
function checkManualPg(text, issues, fixes, items) {
  var pgRe = /<div class="pg reveal">([\s\S]*?)<\/div>/g;
  var blocks = [];
  var m;
  while ((m = pgRe.exec(text))) blocks.push(m[1]);
  var joined = blocks.join('\n');

  if (blocks.length !== PAGES.length) {
    issues.push('使用说明书.html：页面清单条数 ' + blocks.length + ' ≠ ' + PAGES.length + '，缺「' + PAGES.map(function (p) { return p.label; }).join('/') + '」中的页面，在 02 打开工具架 .pg 块补');
  }

  PAGES.forEach(function (p) {
    var ok = joined.indexOf(p.label) !== -1;
    items.push({ doc: '使用说明书.html', check: '页面清单', entry: p.label, pass: ok, detail: ok ? '已登记' : '缺页面条目' });
    if (!ok) {
      issues.push('使用说明书.html：缺页面「' + p.label + '」— 在 02 打开工具架 .pg 块补一行');
      fixes.push({ doc: '使用说明书.html', action: 'add', section: '02 打开工具架', entry: p.label });
    }
  });
}

// 检查② index.html AI 参考注释：每个 page-{id} 都在（只认含 PAGES: 的注释块，跳过 Google Fonts 等普通注释）
function checkIndexComment(text, issues, fixes, items) {
  var cms = text.match(/<!--([\s\S]*?)-->/g) || [];
  var comment = '';
  for (var i = 0; i < cms.length; i++) {
    if (cms[i].indexOf('PAGES:') !== -1) { comment = cms[i].replace(/<!--|-->/g, ''); break; }
  }
  PAGES.forEach(function (p) {
    var needle = 'page-' + p.id;
    var ok = comment.indexOf(needle) !== -1;
    items.push({ doc: 'web/index.html', check: 'PAGES 注释', entry: needle, pass: ok, detail: ok ? '已登记' : '注释缺 page-id' });
    if (!ok) {
      issues.push('web/index.html：AI 参考注释缺「' + needle + '」— 在顶部注释 PAGES 行补');
      fixes.push({ doc: 'web/index.html', action: 'add', section: '注释 PAGES 行', entry: needle });
    }
  });
}

// 检查③ 三文档 routes.js 行「N 页」：必须 == PAGES.length
function checkRoutePages(issues, fixes, items) {
  DOCS.forEach(function (doc) {
    var text = readSafe(doc.file);
    if (text === null) { issues.push(doc.name + ' 不可读，跳过 页数 检查'); return; }
    var line = text.split('\n').filter(function (l) { return l.indexOf('routes.js') !== -1; })[0];
    if (!line) return;
    var mm = line.match(/(\d+)\s*页/);
    if (!mm) return;
    var n = parseInt(mm[1], 10);
    var ok = n === PAGES.length;
    items.push({ doc: doc.name, check: '页数', entry: n + ' 页', pass: ok, detail: ok ? '与页面数一致' : '页数与 PAGES(' + PAGES.length + ') 不符' });
    if (!ok) {
      issues.push(doc.name + '：routes.js 行写「' + n + ' 页」，实际 ' + PAGES.length + ' 页 — 改成 ' + PAGES.length);
      fixes.push({ doc: doc.name, action: 'edit', section: 'routes.js 行', entry: n + ' 页 → ' + PAGES.length + ' 页' });
    }
  });
}

function auditDocs() {
  var issues = [];
  var fixes = [];
  var items = [];

  var manual = readSafe(path.join(PROJECT, 'docs', '使用说明书.html'));
  var index = readSafe(path.join(PROJECT, 'web', 'index.html'));
  if (manual === null) issues.push('使用说明书.html 不可读');
  else checkManualPg(manual, issues, fixes, items);
  if (index === null) issues.push('web/index.html 不可读');
  else checkIndexComment(index, issues, fixes, items);
  checkRoutePages(issues, fixes, items);

  return { ok: issues.length === 0, total: items.length, errors: issues.length, issues: issues, fixes: fixes, items: items };
}

module.exports = { auditDocs: auditDocs, PAGES: PAGES };
