// smoke — 冒烟：spawn 真 server，验证核心端点活着
const { test } = require('node:test');
const assert = require('node:assert');
const { boot } = require('./helpers');

test('smoke: server starts and /api/tools returns tools', async t => {
  const srv = await boot(t);
  const res = await fetch(srv.base + '/api/tools');
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  const ids = data.tools.map(x => x.id);
  assert.ok(ids.includes('webapp'), 'webapp present');
  assert.ok(ids.includes('orphantool'), 'orphantool present');
  const webapp = data.tools.find(x => x.id === 'webapp');
  assert.strictEqual(webapp.state, 'stopped', 'webapp valid manifest, stopped (port closed)');
  const orphan = data.tools.find(x => x.id === 'orphantool');
  assert.strictEqual(orphan.state, 'orphan');
});

test('smoke: /api/tips and /api/apps and /api/registry respond', async t => {
  const srv = await boot(t);
  const tips = await (await fetch(srv.base + '/api/tips')).json();
  assert.strictEqual(tips.ok, true);
  assert.strictEqual(tips.tips.length, 2, 'two non-protected tips');
  assert.ok(tips.tips.every(x => x.file !== 'CONSTITUTION.md'));

  const apps = await (await fetch(srv.base + '/api/apps')).json();
  assert.strictEqual(apps.ok, true);
  assert.strictEqual(apps.apps.length, 2);

  const reg = await (await fetch(srv.base + '/api/registry')).json();
  assert.strictEqual(reg.ok, true);
  assert.strictEqual(reg.docs.length, 2);
});
