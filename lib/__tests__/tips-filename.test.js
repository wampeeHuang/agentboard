// tips-filename.test.js — 回归：同一分钟内连写多条经验日志/原则，文件名必须各不相同
//
// 原缺陷（2026-09-11 实测发现）：POST /api/tips 用「补秒」处理文件名冲突，
// 同一秒内的第二条依然算出同一个名字，第三次写盘直接覆盖第二次 —— 条目静默丢失。
// POST /api/principles 是同一段逻辑，同样受影响。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

function tipPayload(n) {
  return {
    type: 'diagnosis',
    title: '并发写入测试 ' + n,
    desc: '第 ' + n + ' 条的正文，用于校验不被覆盖。',
    source: 'tips-filename 回归测试'
  };
}

test('同一分钟内连写三条 tips 不覆盖：文件名互不相同且内容都在', async t => {
  const srv = await boot(t);
  const files = [];
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(srv.base + '/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tipPayload(i))
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    files.push(body.file);
  }

  assert.strictEqual(new Set(files).size, 3,
    '三条必须落在三个不同文件，实际: ' + JSON.stringify(files));

  // 三条内容都要在磁盘上，且标题与正文对得上（没有互相覆盖）
  for (let i = 1; i <= 3; i++) {
    const p = path.join(srv.tipsDir, files[i - 1]);
    assert.ok(fs.existsSync(p), '文件存在: ' + files[i - 1]);
    const md = fs.readFileSync(p, 'utf8');
    assert.ok(md.includes('# 并发写入测试 ' + i), '标题匹配: ' + files[i - 1]);
    assert.ok(md.includes('第 ' + i + ' 条的正文'), '正文匹配: ' + files[i - 1]);
  }

  // 命名一致性：都带 tip- 前缀与 .md 后缀；冲突条目不得截断时间戳
  // （截断会破坏按文件名排序等价于按时间排序）
  files.forEach(function (f) {
    assert.ok(/^tip-\d{8}-\d{4}(-\d{3})?\.md$/.test(f), '命名格式: ' + f);
  });
});

test('同一分钟内连写三条 principles 不覆盖', async t => {
  const srv = await boot(t);
  const files = [];
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(srv.base + '/api/principles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'method',
        title: '并发原则 ' + i,
        what: '是什么 ' + i,
        how: '怎么用 ' + i
      })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    files.push(body.file);
  }
  assert.strictEqual(new Set(files).size, 3,
    '三条原则必须落在三个不同文件，实际: ' + JSON.stringify(files));
  files.forEach(function (f, idx) {
    const md = fs.readFileSync(path.join(srv.home, 'principles', f), 'utf8');
    assert.ok(md.includes('# 并发原则 ' + (idx + 1)), '标题匹配: ' + f);
  });
});

test('并发写入（不 await 顺序）也不丢条目', async t => {
  const srv = await boot(t);
  const results = await Promise.all([1, 2, 3, 4].map(function (i) {
    return fetch(srv.base + '/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tipPayload(i))
    }).then(function (r) { return r.json(); });
  }));
  const files = results.map(function (r) { return r.file; });
  assert.strictEqual(new Set(files).size, 4,
    '并发四条也要四个文件，实际: ' + JSON.stringify(files));
  const onDisk = new Set(files.filter(function (f) {
    return fs.existsSync(path.join(srv.tipsDir, f));
  }));
  assert.strictEqual(onDisk.size, 4, '四条都在磁盘上');
});
