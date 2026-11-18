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
  var config = readJson(path.join(paths.CONFIG_DIR, 'links.json')) || {};
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

module.exports = { loadLinks: loadLinks, safeUrl: safeUrl, safeIcon: safeIcon };
