// lib/brand-drift.js — 品牌漂移审计：web/_tokens.css :root 品牌承载值必须 ⊆ vivi 品牌契约值集
// 只审品牌身份键（绿/深绿/黄/淡黄绿/墨/标题字体首族）；派生色（状态/lang/border）是 agentboard 本地 token，不比对。
// 契约精确值唯一机器源 = vivi-design-system/assets/vivi-tokens.json（brand-dna.md 只写策略散文、声明指向 json）。
// 渲染侧 (:root) 与 使用说明书.html 比对 tokens.json 的 type:color hex 集 + --font-head 首族；文件不可读 → 报错失败，不静默通过。
var fs = require('fs');
var os = require('os');
var path = require('path');

var VIVI_SKILL = path.join(os.homedir(), '.claude', 'skills', 'vivi-design-system');
var BRAND_DNA = path.join(VIVI_SKILL, 'brand-dna.md');
var VIVI_TOKENS = path.join(VIVI_SKILL, 'assets', 'vivi-tokens.json');

// 契约值集加载：vivi-tokens.json 优先（现行格式）；缺失/不可解析回退 brand-dna.md 内联 hex 旧格式。
// 返回 { hexes:Set<string>, fontHead:string|null }；两源都不可读返回 null。
function loadContract() {
  try {
    var tok = JSON.parse(fs.readFileSync(VIVI_TOKENS, 'utf8'));
    var hexes = [];
    var fontHead = null;
    (tok.tokens || []).forEach(function (t) {
      if (t.type === 'color' && /^#[0-9A-Fa-f]{6}$/.test(t.value || '')) hexes.push(t.value.toUpperCase());
      if (t.css === '--font-head' && t.value) fontHead = String(t.value).split(',')[0].replace(/['"]/g, '').trim();
    });
    if (hexes.length) return { hexes: new Set(hexes), fontHead: fontHead };
  } catch (_) {}
  try {
    var dna = fs.readFileSync(BRAND_DNA, 'utf8');
    var m = dna.match(/标题栈[^']*'([^']+)'/);
    return {
      hexes: new Set((dna.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(function (h) { return h.toUpperCase(); })),
      fontHead: m ? m[1].trim() : null
    };
  } catch (_) {
    return null;
  }
}

function auditBrand(cssPaths) {
  var cssFiles = cssPaths || [
    path.join(__dirname, '..', 'web', '_tokens.css'),
    path.join(__dirname, '..', 'docs', '使用说明书.html')
  ];
  var errors = [];
  var items = [];

  var contract = loadContract();
  if (!contract) {
    return { ok: false, total: cssFiles.length * 6, errors: 1, issues: ['品牌契约不可读: ' + VIVI_TOKENS + ' / ' + BRAND_DNA + ' — 契约搬走/改名须同步本模块路径'], items: [{ file: path.basename(VIVI_TOKENS), check: '契约文件', pass: false, detail: '品牌契约不可读: ' + VIVI_TOKENS + ' / ' + BRAND_DNA }] };
  }
  var dnaHexes = contract.hexes;
  var dnaTitleFont = contract.fontHead;

  cssFiles.forEach(function(css) {
    var stylesheet;
    try {
      stylesheet = fs.readFileSync(css, 'utf8');
    } catch (e) {
      errors.push('样式文件不可读: ' + css + ' (' + e.message + ')');
      items.push({ file: path.basename(css), check: '文件', pass: false, detail: '样式文件不可读: ' + e.message });
      return;
    }

    var root = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\{([\s\S]*?)\}/);
    if (!root) { errors.push(css + ' 无 :root 块'); items.push({ file: path.basename(css), check: '文件', pass: false, detail: '无 :root 块' }); return; }
    var v = {};
    root[1].split(';').forEach(function(d) {
      var i = d.indexOf(':');
      if (i > 0) v[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });

    var where = path.basename(css);
    [['--green', '绿'], ['--green-deep', '深绿'], ['--yellow', '黄'], ['--green-soft', '淡黄绿'], ['--ink', '墨']].forEach(function(p) {
      var key = p[0], label = p[1];
      var val = v[key] !== undefined ? v[key] : v[key.replace('--green-deep', '--deep').replace('--green-soft', '--soft')];
      if (!val) { errors.push(where + ' :root 缺品牌键 ' + key); items.push({ file: where, check: label, key: key, pass: false, detail: '缺品牌键 ' + key }); return; }
      var hex = val.toUpperCase();
      var pass = dnaHexes.has(hex);
      items.push({ file: where, check: label, key: key, value: hex, pass: pass, detail: pass ? hex + ' 在契约值集内' : hex + ' 不在 brand-dna.md 色值集内' });
      if (!pass) errors.push(where + ' ' + label + ' ' + key + '=' + hex + ' 不在 brand-dna.md 色值集内 — 品牌漂移');
    });

    var fontHead = (v['--font-head'] || '').split(',')[0].replace(/['"]/g, '').trim();
    if (!fontHead) { errors.push(where + ' :root 缺 --font-head'); items.push({ file: where, check: '标题字体', key: '--font-head', pass: false, detail: '缺 --font-head' }); }
    else {
      var pass = !!dnaTitleFont && fontHead === dnaTitleFont;
      items.push({ file: where, check: '标题字体', key: '--font-head', value: fontHead, pass: pass, detail: pass ? fontHead + ' = 契约' + dnaTitleFont : '首族=' + fontHead + ' ≠ 契约=' + dnaTitleFont });
      if (!pass) errors.push(where + ' 标题字体首族=' + fontHead + ' ≠ 契约=' + dnaTitleFont + ' — 字体漂移');
    }
  });

  if (!dnaTitleFont) errors.push('品牌契约缺 --font-head 字体栈声明（vivi-tokens.json fontFamily 或 brand-dna.md 旧格式）— 契约格式变更须同步本模块解析');

  return { ok: errors.length === 0, total: items.length, errors: errors.length, issues: errors, items: items };
}

module.exports = { auditBrand: auditBrand, BRAND_DNA_PATH: BRAND_DNA };
