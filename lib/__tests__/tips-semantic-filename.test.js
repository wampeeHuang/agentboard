// tips-semantic-filename.test.js — 回归：POST /api/tips 支持语义化文件名
//
// 背景：tips/CONSTITUTION.md §三 要求「文件名 kebab-case，语义化」，但 POST 只按
// 时间戳生成 tip-YYYYMMDD-HHMM.md，走 API 写入的条目必然违反宪法。这里锁住三件事：
//   1. 传 file → 按 file 落盘（宪法合规路径）
//   2. file 非法（大写/中文/空格/路径穿越）→ 400，且不落盘
//   3. 不传 file → 保留时间戳兜底（旧调用方与并发写入回归不受影响）
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

function post(base, body) {
  return fetch(base + '/api/tips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function payload(extra) {
  return Object.assign({
    type: 'diagnosis',
    title: '语义文件名测试',
    desc: '正文占位。',
    source: 'tips-semantic-filename 回归测试'
  }, extra || {});
}

test('传 file → 按 kebab-case 文件名落盘', async t => {
  const srv = await boot(t);
  const res = await post(srv.base, payload({ file: 'grid-ruler-not-found.md' }));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.file, 'grid-ruler-not-found.md');

  const p = path.join(srv.tipsDir, 'grid-ruler-not-found.md');
  assert.ok(fs.existsSync(p), '文件按指定名落盘');
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(md.includes('# 语义文件名测试'), '标题写入');
  assert.ok(md.includes('\ntype: diagnosis\n'), 'type 写进 frontmatter');
  assert.ok(/^---\n[\s\S]*\n---\n\n# /.test(md), 'frontmatter 结构正常（--- 包裹 + 空行 + H1）');
});

test('file 非法 → 400 且不落盘', async t => {
  const srv = await boot(t);
  const bad = [
    'Grid-Ruler.md',        // 大写
    '网格标尺.md',            // 中文
    'grid ruler.md',        // 空格
    'grid_ruler.md',        // 下划线
    'grid-ruler',           // 缺 .md
    '../evil.md',           // 路径穿越
    'dsh/evil.md',          // 带目录
    '-leading.md',          // 连字符开头
    'trailing-.md'          // 连字符结尾
  ];
  for (const f of bad) {
    const res = await post(srv.base, payload({ file: f }));
    assert.strictEqual(res.status, 400, '应拒绝: ' + f + ' 实际 ' + res.status);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
  }
  // 目录里不该多出任何东西（除了 fixtures 自带内容）
  const leaked = fs.existsSync(path.join(srv.tipsDir, 'evil.md'));
  assert.strictEqual(leaked, false, '路径穿越不得落盘');
});

test('同名 file 已存在 → 409 拒绝覆盖', async t => {
  const srv = await boot(t);
  const first = await post(srv.base, payload({ file: 'same-name.md', desc: '第一版正文。' }));
  assert.strictEqual(first.status, 200);

  const second = await post(srv.base, payload({ file: 'same-name.md', desc: '第二版正文，不该出现。' }));
  assert.strictEqual(second.status, 409);
  const body = await second.json();
  assert.strictEqual(body.ok, false);

  const md = fs.readFileSync(path.join(srv.tipsDir, 'same-name.md'), 'utf8');
  assert.ok(md.includes('第一版正文'), '原条目未被覆盖');
  assert.ok(!md.includes('第二版正文'), '第二条没写进去');
});

test('不传 file → 保留时间戳兜底（旧行为不变）', async t => {
  const srv = await boot(t);
  const res = await post(srv.base, payload());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(/^tip-\d{8}-\d{4}(-\d{3})?\.md$/.test(body.file), '时间戳命名: ' + body.file);
  assert.ok(fs.existsSync(path.join(srv.tipsDir, body.file)));
});

test('domain=dsh 时语义文件名落进 dsh/ 子目录', async t => {
  const srv = await boot(t);
  const res = await post(srv.base, payload({ file: 'dsh-semantic-name.md', domain: 'dsh' }));
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.file, 'dsh/dsh-semantic-name.md');
  assert.ok(fs.existsSync(path.join(srv.tipsDir, 'dsh', 'dsh-semantic-name.md')));
});
