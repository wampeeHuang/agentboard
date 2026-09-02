// lib/schema-loader.js — manifest-schema 热重载加载器
// 单一真相源仍是 lib/manifest-schema.js。本模块按 mtime 检测文件变更：
// 变更即清 require.cache 重载，schema 改动（分类/字段/定义）无需重启 dashboard。
var fs = require('fs');
var resolved = require.resolve('./manifest-schema');
var cached = { mtime: 0, mod: null };

function get() {
  var mtime = 0;
  try { mtime = fs.statSync(resolved).mtimeMs; } catch (_) {}
  if (cached.mod && mtime === cached.mtime) return cached.mod;
  try {
    delete require.cache[resolved];
    var mod = require('./manifest-schema');
    cached = { mtime: mtime, mod: mod };
    return mod;
  } catch (e) {
    // 文件写了一半/坏了：保留最后可用版本，页面不崩；修好后下次自动加载新版本
    if (cached.mod) return cached.mod;
    throw e;
  }
}

module.exports = { get: get };
