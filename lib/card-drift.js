// lib/card-drift.js — 卡片尺寸契约审计
// 契约：工具架全部卡片 宽度 384、栅格间距 ≥32px；
//       高度分两级 —— 工具类卡片 256（--card-h），分类筛选块 96（--dim-h）。
// 契约值唯一源 = web/_tokens.css 的 --card-w / --card-h / --dim-h / --card-gap。
// 这里只验「渲染侧有没有守约」：宽高必须锚在 token 上，栅格列不得用 minmax()/1fr 让卡片随容器浮动，gap 不得小于 32px。
// 文件不可读 → 报错失败，不静默通过。
var fs = require('fs');
var path = require('path');

var WEB = path.join(__dirname, '..', 'web');
var TOKENS_CSS = path.join(WEB, '_tokens.css');
var STYLE_CSS = path.join(WEB, '_style.css');
var TIPS_CSS = path.join(WEB, 'shared', 'tips-panel.css');

var CARD_W = 384;
var CARD_H = 256;   // 工具类卡片高度
var DIM_H = 96;     // 分类筛选块高度
var MIN_GAP = 32;

// 每张卡的两条规则：栅格容器 + 卡片本体。hToken/hPx = 该卡高度锚的 token 与期望值。
var TARGETS = [
  { name: '工具卡/经验卡', file: STYLE_CSS, fileLabel: '_style.css', grid: '.tool-grid', card: '.tool-card', hToken: 'card-h', hPx: CARD_H },
  { name: '分类卡', file: STYLE_CSS, fileLabel: '_style.css', grid: '.dim-blocks', card: '.dim-block', hToken: 'dim-h', hPx: DIM_H },
  { name: '分类卡(共享面板)', file: TIPS_CSS, fileLabel: 'shared/tips-panel.css', grid: '.tips-panel-root .dim-blocks', card: '.tips-panel-root .dim-block', hToken: 'dim-h', hPx: DIM_H }
];

function readFile(f) {
  try { return fs.readFileSync(f, 'utf8'); }
  catch (e) { throw new Error('读不到 ' + path.basename(f) + '：' + e.message); }
}

// 取某选择器所有规则体（只认行首出现，避开注释与后代选择器误伤）
function ruleBodies(css, selector) {
  var esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('(?:^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g');
  var out = [];
  var m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out;
}

function tokenValue(css, name) {
  var re = new RegExp('--' + name + '\\s*:\\s*([^;]+);');
  var m = css.match(re);
  return m ? m[1].trim() : null;
}

function px(raw) {
  var m = String(raw == null ? '' : raw).match(/^(-?\d+(?:\.\d+)?)px$/);
  return m ? parseFloat(m[1]) : null;
}

// 值是否锚定某 token（允许 var(--x) 与 var(--x,384px) 两种写法）
function usesToken(value, token) {
  return new RegExp('var\\(\\s*--' + token + '\\s*[,)]').test(String(value));
}

// 取某条声明（只匹配顶层，简单场景够用）
function decl(body, prop) {
  var m = String(body).match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}

function auditCard() {
  var items = [];
  var issues = [];

  function rec(check, file, pass, detail) {
    items.push({ file: file, check: check, pass: pass, detail: detail });
    if (!pass) issues.push(file + '：' + detail);
  }

  var tokensCss, cssCache = {};
  try {
    tokensCss = readFile(TOKENS_CSS);
  } catch (e) {
    return { ok: false, total: 3, errors: 3, issues: ['contract_error: ' + e.message], items: [] };
  }

  // ── 契约 token 本身 ──
  var tw = px(tokenValue(tokensCss, 'card-w'));
  var th = px(tokenValue(tokensCss, 'card-h'));
  var dh = px(tokenValue(tokensCss, 'dim-h'));
  var tg = px(tokenValue(tokensCss, 'card-gap'));

  if (tw === null) rec('token --card-w', '_tokens.css', false, '缺 --card-w 或不是 px 值');
  else rec('token --card-w', '_tokens.css', tw === CARD_W, '--card-w=' + tw + 'px，契约要求 ' + CARD_W + 'px');

  if (th === null) rec('token --card-h', '_tokens.css', false, '缺 --card-h 或不是 px 值');
  else rec('token --card-h', '_tokens.css', th === CARD_H, '--card-h=' + th + 'px，工具类卡片要求 ' + CARD_H + 'px');

  if (dh === null) rec('token --dim-h', '_tokens.css', false, '缺 --dim-h 或不是 px 值');
  else rec('token --dim-h', '_tokens.css', dh === DIM_H, '--dim-h=' + dh + 'px，分类筛选块要求 ' + DIM_H + 'px');

  if (tg === null) rec('token --card-gap', '_tokens.css', false, '缺 --card-gap 或不是 px 值');
  else rec('token --card-gap', '_tokens.css', tg >= MIN_GAP, '--card-gap=' + tg + 'px，契约要求 ≥' + MIN_GAP + 'px');

  // ── 每个卡片目标 ──
  TARGETS.forEach(function (t) {
    if (!(t.file in cssCache)) {
      try { cssCache[t.file] = readFile(t.file); }
      catch (e) { cssCache[t.file] = null; }
    }
    var css = cssCache[t.file];
    if (!css) {
      rec('栅格 ' + t.name, t.fileLabel, false, '文件读不到');
      rec('卡片 ' + t.name, t.fileLabel, false, '文件读不到');
      return;
    }

    // 栅格：列宽锚 token、禁 minmax/1fr、gap ≥32
    var grids = ruleBodies(css, t.grid);
    var gBad = [];
    if (!grids.length) gBad.push('找不到 ' + t.grid + ' 规则');
    grids.forEach(function (b) {
      var cols = decl(b, 'grid-template-columns');
      if (t.grid.indexOf('.dim-blocks') >= 0 && !cols) {
        // 共享面板用 flex 实现，列宽下沉到卡片本体的 flex-basis，这里只查 gap
      } else if (!cols) {
        gBad.push('没声明 grid-template-columns');
      } else if (!usesToken(cols, 'card-w')) {
        gBad.push('列宽=' + cols + '，应锚定 var(--card-w)');
      } else if (/minmax\s*\(/.test(cols) || /1fr/.test(cols)) {
        gBad.push('列宽含 minmax()/1fr，卡片宽度会随容器浮动');
      }
      var gap = decl(b, 'gap');
      if (!gap) gBad.push('没声明 gap');
      else if (!usesToken(gap, 'card-gap')) {
        var gp = px(gap);
        if (gp === null || gp < MIN_GAP) gBad.push('gap=' + gap + '，小于 ' + MIN_GAP + 'px');
      }
    });
    rec('栅格 ' + t.name, t.fileLabel, gBad.length === 0,
      gBad.length ? gBad.join('；') : '列宽锚定 --card-w，gap 锚定 --card-gap');

    // 卡片本体：宽高锚 token
    var cards = ruleBodies(css, t.card);
    var cBad = [];
    if (!cards.length) cBad.push('找不到 ' + t.card + ' 规则');
    cards.forEach(function (b) {
      var w = decl(b, 'width') || decl(b, 'flex');
      // 工具卡用 height（固定），分类卡用 min-height（基准 96，标签多才长）
      var h = decl(b, 'height') || decl(b, 'min-height');
      if (!w) cBad.push('没声明 width');
      else if (!usesToken(w, 'card-w') && px(String(w).replace(/^0 0\s+/, '')) !== CARD_W) {
        cBad.push('width=' + w + '，应锚定 var(--card-w)');
      }
      if (!h) cBad.push('没声明 height/min-height');
      else if (!usesToken(h, t.hToken) && px(h) !== t.hPx) {
        cBad.push('高度=' + h + '，应锚定 var(--' + t.hToken + ')（基准 ' + t.hPx + 'px）');
      }
    });
    rec('卡片 ' + t.name, t.fileLabel, cBad.length === 0,
      cBad.length ? cBad.join('；') : 'width 锚定 --card-w，height 锚定 --' + t.hToken + '（' + t.hPx + 'px）');
  });

  return { ok: issues.length === 0, total: items.length, errors: issues.length, issues: issues, items: items };
}

module.exports = { auditCard: auditCard, CARD_W: CARD_W, CARD_H: CARD_H, DIM_H: DIM_H, MIN_GAP: MIN_GAP };
