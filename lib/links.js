// lib/links.js — 通用外部入口（link-only，不绑定任何供应商）
// 配置：DATA_ROOT/config/links.json
// 旧兼容：DATA_ROOT/state/private-links.json 的 keyManagementUrl 会在未配置时映射成一条 link
var fs = require('fs');
var path = require('path');
var paths = require('./paths');

var MAX_LINKS = 16;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function configPath() { return path.join(paths.CONFIG_DIR, 'links.json'); }

function readConfig() { return readJson(configPath()) || {}; }

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 80);
}

function safeUrl(raw) {
  try {
    var u = new URL(String(raw || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch (_) { return null; }
}

function safeIcon(raw) {
  var icon = String(raw || '').trim();
  if (!/^[a-z0-9._-]+\.(png|svg|webp)$/i.test(icon)) return '';
  if (icon.indexOf('..') !== -1) return '';
  return icon;
}

function safeId(raw, index) {
  var id = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(id)) id = 'link-' + (index + 1);
  return id;
}

function normalize(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  var url = safeUrl(raw.url);
  if (!url) return null;
  var label = cleanText(raw.label || raw.name, 48);
  if (!label) return null;
  return {
    id: safeId(raw.id, index),
    label: label,
    url: url,
    icon: safeIcon(raw.icon),
    description: cleanText(raw.description, 120),
    openInNewTab: raw.openInNewTab !== false,
    enabled: raw.enabled !== false
  };
}

function loadLinks() {
  var config = readConfig();
  var rawList = Array.isArray(config.links) ? config.links : null;

  if (!rawList) {
    var legacy = readJson(path.join(paths.STATE_DIR, 'private-links.json')) || {};
    if (Array.isArray(legacy.links)) {
      rawList = legacy.links;
    } else if (legacy.keyManagementUrl) {
      rawList = [{
        id: 'key-management',
        label: legacy.keyManagementLabel || '密钥管理中心',
        url: legacy.keyManagementUrl,
        icon: legacy.keyManagementIcon || ''
      }];
    } else {
      rawList = [];
    }
  }

  var seen = {};
  var out = [];
  rawList.forEach(function (raw, i) {
    var link = normalize(raw, i);
    if (!link || !link.enabled || seen[link.id]) return;
    seen[link.id] = true;
    out.push(link);
  });
  return out.slice(0, MAX_LINKS);
}

function saveConfig(cfg) {
  fs.mkdirSync(paths.CONFIG_DIR, { recursive: true });
  var file = configPath();
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function currentRawList(cfg) {
  if (Array.isArray(cfg.links)) return cfg.links;
  return loadLinks();
}

function uniqueId(requested, list) {
  var base = String(requested || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(base)) base = 'link-' + Date.now().toString(36);
  var id = base, n = 2;
  while (!requested && list.some(function (l) { return l.id === id; })) id = base + '-' + (n++);
  return id;
}

function upsertLink(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'link payload required' };
  var cfg = readConfig();
  var raw = currentRawList(cfg).slice();
  var list = raw.map(function (l, i) { return normalize(l, i); }).filter(Boolean);
  var id = uniqueId(input.id, list);
  var link = normalize(Object.assign({}, input, { id: id }), list.length);
  if (!link) return { ok: false, error: 'label and http(s) URL are required' };
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) { idx = i; break; } }
  if (idx >= 0) list[idx] = link; else list.push(link);
  cfg.links = list.slice(0, MAX_LINKS + 1);
  try { saveConfig(cfg); } catch (e) { return { ok: false, error: 'write failed: ' + e.message }; }
  return { ok: true, link: link, links: loadLinks() };
}

function removeLink(id) {
  var cfg = readConfig();
  var raw = currentRawList(cfg).slice();
  var list = raw.map(function (l, i) { return normalize(l, i); }).filter(Boolean);
  var next = list.filter(function (l) { return l.id !== id; });
  if (next.length === list.length) return { ok: false, error: 'link not found: ' + id };
  cfg.links = next;
  try { saveConfig(cfg); } catch (e) { return { ok: false, error: 'write failed: ' + e.message }; }
  return { ok: true, links: loadLinks() };
}

module.exports = {
  loadLinks: loadLinks,
  upsertLink: upsertLink,
  removeLink: removeLink,
  safeUrl: safeUrl,
  safeIcon: safeIcon,
  configPath: configPath
};
