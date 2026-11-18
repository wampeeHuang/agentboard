// lib/migrations.js — 数据层启动迁移。前端不参与、不感知旧格式。
// 迁移规则：只读写 DATA_ROOT；已完成标记写到 state/migrations/；旧文件保留为备份。
var fs = require('fs');
var path = require('path');
var paths = require('./paths');
var links = require('./links');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function markerPath(id) {
  return path.join(paths.STATE_DIR, 'migrations', id + '.json');
}

function writeMarker(id, info) {
  var file = markerPath(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.assign({ id: id, migratedAt: new Date().toISOString() }, info), null, 2) + '\n', 'utf8');
}

function migrateLinksV1() {
  var legacyFile = path.join(paths.STATE_DIR, 'private-links.json');
  if (!fs.existsSync(legacyFile)) return { added: 0, source: null };
  var legacy = readJson(legacyFile) || {};
  var raw = [];
  if (Array.isArray(legacy.links)) {
    raw = legacy.links;
  } else if (legacy.keyManagementUrl) {
    raw = [{
      id: 'key-management',
      label: legacy.keyManagementLabel || '密钥管理中心',
      url: legacy.keyManagementUrl,
      icon: legacy.keyManagementIcon || 'feishu-base.png',
      openInNewTab: true
    }];
  }

  var existing = links.loadLinks();
  var added = 0;
  raw.forEach(function (entry) {
    if (!entry || !entry.url) return;
    var url = links.safeUrl(entry.url);
    if (!url) return;
    if (existing.some(function (l) { return l.url === url; })) return;
    var result = links.upsertLink({
      id: entry.id,
      label: entry.label || entry.name || '外部入口',
      url: url,
      icon: entry.icon || '',
      openInNewTab: entry.openInNewTab !== false
    });
    if (result.ok) {
      added++;
      existing = links.loadLinks();
    }
  });

  var backup = path.join(paths.STATE_DIR, 'migrations', 'private-links-v1.backup.json');
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.copyFileSync(legacyFile, backup);

  return { added: added, source: legacyFile, backup: backup };
}

var MIGRATIONS = [
  { id: 'links-v1', run: migrateLinksV1 }
];

function run() {
  var results = [];
  MIGRATIONS.forEach(function (migration) {
    var marker = markerPath(migration.id);
    if (fs.existsSync(marker)) return;
    try {
      var info = migration.run();
      writeMarker(migration.id, info);
      results.push(Object.assign({ id: migration.id, ok: true }, info));
    } catch (e) {
      // 迁移失败不阻断服务，但必须可见；保留旧文件，下一次启动可重试。
      results.push({ id: migration.id, ok: false, error: e.message });
      try { console.error('[migrations] ' + migration.id + ' failed:', e.message); } catch (_) {}
    }
  });
  return results;
}

module.exports = { run: run, MIGRATIONS: MIGRATIONS, migrateLinksV1: migrateLinksV1 };
