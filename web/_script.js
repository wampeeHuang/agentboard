// --- emergency: show runtime errors on page ---
window.onerror = function(msg, src, line, col, err) {
  var e = document.getElementById('errBox');
  if (e) { e.style.display='block'; e.textContent += ' | ' + msg + ' @L' + line; }
};
window.addEventListener('unhandledrejection', function(evt) {
  var e = document.getElementById('errBox');
  if (e) { e.style.display='block'; e.textContent += ' | Promise: ' + (evt.reason||{}).message; }
});
var tools = [];
var starting = {}; // id → true when waiting for start
var stopping = {}; // id → true when waiting for stop
var opened = {};   // id → true when user clicked "打开" this session
try { opened = JSON.parse(sessionStorage.getItem('opened')||'{}'); } catch(_) {}
var cronState = null;
var domainFilter = 'all'; // 功能分类
var accFilter = 'all';    // 接入形态
var stateFilter = 'all';  // 状态
var appsData = null;
var princData = null;
var princF = 'all';

// ── 三维异色筛选块 ──
// 功能分类取值从 /api/tools/schema 派生（唯一真相源），前端不再手写副本 → 与编辑表单永不漂移
var dimCatValues = null;   // schema categoryValues
var dimCatTips = {};       // schema categoryDefinitions[].desc（悬停气泡）
var DIMS = [
  { key:'category', label:'功能分类', cls:'fn',     bg:'#74A63F', tip:'按工具干什么筛选。取值与编辑表单同源（schema），悬停看每类定义' },
  { key:'acc',      label:'接入形态', cls:'acc',    bg:'#FFFFFF', tip:'按怎么用筛选：有没有 Web 界面 / 命令行 / 纯 API', values:['网页界面','命令行','API 调用'] },
  { key:'state',    label:'状态',     cls:'status', bg:'#EEF4EF', tip:'按运行可用性筛选：现在能不能用', values:['运行中','已停止','已停用','仅接入'] }
];
var ACC_TIPS = {
  '网页界面':'有 Web 界面，点卡片「打开」直接进入',
  '命令行':'用完就走的一次性命令，Claude Code 用 /触发词 调用',
  'API 调用':'外部服务 API，无本地界面，只填地址 + 密钥'
};
var STATE_TIPS = {
  '运行中':'进程在跑，界面/接口可访问',
  '已停止':'进程没跑，点「启动」拉起',
  '已停用':'卡片停用，AI 不可调用',
  '仅接入':'纯远程 API，无本地进程，无需启动'
};

// 是否有本地进程（命令/端口/项目路径）→ 本地/远程 判定
function hasLocalProcess(t) {
  return !!(t.startCommand || t.stopCommand || (t.ports && t.ports.length > 0) || t.port || t.projectPath);
}
function getToolLoc(t) {
  if (t.loc) return t.loc;
  return (t.apiBase && !hasLocalProcess(t)) ? '远程' : '本地';
}
// 纯远程 API（无本地进程）→ 仅接入
function isApiOnly(t) {
  return t.apiBase && !hasLocalProcess(t);
}
// 接入形态：真实 type/form → 原型词汇（网页界面/命令行/API调用/文件夹）
function getToolAcc(t) {
  if (t.type === 'cli' || t.type === 'command') return '命令行';
  if (t.type === 'folder') return '文件夹';
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  var hasCommands = t.startCommand || t.stopCommand;
  if (hasPorts || t.type === 'group') return '网页界面';
  if (t.apiBase && !hasCommands) return 'API 调用';
  if (hasCommands) return '命令行';
  return '网页界面';
}

function stateLabelOf(state, t) {
  if (t && isApiOnly(t)) return '仅接入';
  if (state === 'running' || state === 'starting') return '运行中';
  if (state === 'disabled') return '已停用';
  return '已停止'; // stopped / halting / broken / incomplete / orphan / stale_path / start_failed
}
function isDimActive(key, val) {
  var cur = key === 'category' ? domainFilter : key === 'acc' ? accFilter : stateFilter;
  return cur === val;
}
function buildDimBlocks() {
  var grid = document.getElementById('dimBlocks'); if (!grid) return;
  var html = '';
  DIMS.forEach(function(d){
    var dimTip = d.tip ? ' data-tip="' + escAttr(d.tip) + '"' : '';
    html += '<div class="dim-block dim-' + d.cls + '" style="--b:' + d.bg + '"><div class="dim-block-title"' + dimTip + '>' + d.label + '<span class="dim-arr">></span></div><div class="dim-block-opts">';
    // 分类取值来自 schema；hash 残留已删分类 → 自愈复位
    var vals = d.key === 'category' ? (dimCatValues || []) : d.values;
    if (d.key === 'category' && dimCatValues && domainFilter !== 'all' && dimCatValues.indexOf(domainFilter) === -1) domainFilter = 'all';
    vals.forEach(function(v){
      var tip = d.key === 'category' ? dimCatTips[v] : d.key === 'acc' ? ACC_TIPS[v] : STATE_TIPS[v];
      html += '<span class="dim-opt' + (isDimActive(d.key, v) ? ' active' : '') + '"' + (tip ? ' data-tip="' + escAttr(tip) + '"' : '') + ' onclick="setDimFilter(\'' + d.key + '\',\'' + v + '\')">' + v + '</span>';
    });
    html += '</div></div>';
  });
  grid.innerHTML = html;
}
function setDimFilter(key, val) {
  if (key === 'category') domainFilter = (domainFilter === val ? 'all' : val);
  else if (key === 'acc') accFilter = (accFilter === val ? 'all' : val);
  else stateFilter = (stateFilter === val ? 'all' : val);
  buildDimBlocks();
  render();
  syncDimHash();
}
function resetDims() {
  domainFilter = 'all'; accFilter = 'all'; stateFilter = 'all';
  var s = document.getElementById('searchInput'); if (s) s.value = '';
  buildDimBlocks();
  render();
  syncDimHash();
}

function getSearchTerm() {
  var inp = document.getElementById('searchInput');
  return (inp && inp.value || '').trim().toLowerCase();
}

function isVirtual(t) {
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  return !hasPorts && !t.startCommand && !t.stopCommand;
}

function toast(m) { showToast(m); }
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#3E571C;color:#fff;padding:10px 24px;font-size:13px;z-index:9999;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:600px;text-align:center;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(function() { t.style.opacity = '0'; }, 5000);
}

/* ── 设计气泡 tooltip：替代默认 title ── */
var _tipEl = null;
function tipBubble() {
  if (_tipEl) return _tipEl;
  _tipEl = document.createElement('div');
  _tipEl.className = 'tip-bubble';
  document.body.appendChild(_tipEl);
  return _tipEl;
}
document.addEventListener('mouseover', function (e) {
  var t = e.target.closest('[data-tip]');
  if (!t) return;
  var b = tipBubble();
  b.textContent = t.getAttribute('data-tip') || '';
  b.style.display = 'block';
  var r = t.getBoundingClientRect();
  var bw = b.offsetWidth, bh = b.offsetHeight;
  var x = r.left + r.width / 2 - bw / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - bw - 8));
  var y = r.top - bh - 8;
  if (y < 8) y = r.bottom + 8;
  b.style.left = x + 'px';
  b.style.top = y + 'px';
});
document.addEventListener('mouseout', function (e) {
  if (e.target.closest('[data-tip]')) { if (_tipEl) _tipEl.style.display = 'none'; }
});

var _cronBackoff = 0;
var _cronTimer = null;

async function fetchCronState() {
  try {
    var res = await fetch('/api/cron/state');
    var data = await res.json();
    if (data.ok) {
      cronState = data;
      _cronBackoff = 0;
    } else {
      _cronBackoff = Math.min((_cronBackoff || 60) * 2, 600);
    }
  } catch (_) {
    _cronBackoff = Math.min((_cronBackoff || 60) * 2, 600);
  }
  if (_cronTimer) clearTimeout(_cronTimer);
  _cronTimer = setTimeout(fetchCronState, (_cronBackoff || 60) * 1000);
}

async function fetchTools() {
  try {
    var res = await fetch('/api/tools');
    var data = await res.json();
    if (data.ok) {
      tools = data.tools;
      // 清除已生效的 starting / stopping 状态
      Object.keys(starting).forEach(function(id){
        var t = tools.find(function(x){return x.id===id;});
        if (t && t.running !== false) delete starting[id];
      });
      Object.keys(stopping).forEach(function(id){
        var t = tools.find(function(x){return x.id===id;});
        if (t && t.running !== true) delete stopping[id];
      });
      updateCounts();
      buildDimBlocks();
      render();
      renderToolsSub();
    } else {
      toast('工具清单加载失败：' + (data.error || '未知错误'));
    }
  } catch(e) {
    var eb = document.getElementById('errBox');
    if (eb) { eb.style.display='block'; eb.textContent += ' | fetchTools: ' + e.message; }
  }
}

function updateCounts() {
  var el;
  el = document.getElementById('navToolsCnt'); if (el) el.textContent = tools.length;
  el = document.getElementById('navAppsCnt'); if (el && appsData) el.textContent = appsData.length;
  el = document.getElementById('navPrincCnt'); if (el && princData) el.textContent = princData.length;
}

function render() {
  var grid = document.getElementById('toolGrid');
  if (!tools.length) {
    grid.innerHTML = '<div class="empty">还没有工具 —— Agent 会在 <code>~/.agentboard/tools/</code> 下写入注册文件，自动上架。</div>';
    return;
  }

  // Filter
  var sorted = tools.slice();
  if (domainFilter !== 'all') sorted = sorted.filter(function(t){return t.category === domainFilter;});
  if (accFilter !== 'all') sorted = sorted.filter(function(t){return getToolAcc(t) === accFilter;});
  if (stateFilter !== 'all') sorted = sorted.filter(function(t){return stateLabelOf(classifyState(t), t) === stateFilter;});
  var search = getSearchTerm();
  if (search) {
    sorted = sorted.filter(function(t){
      return t.name.toLowerCase().indexOf(search) !== -1 || t.id.toLowerCase().indexOf(search) !== -1 || (t.description||'').toLowerCase().indexOf(search) !== -1;
    });
  }

  // Sort: 用户排列(cardOrder) 优先 → 新卡按 分类→运行→order 兜底
  var cardOrder = loadCardOrder();
  sorted.sort(function(a,b){ return compareTools(a,b,cardOrder); });

  if (!sorted.length) {
    grid.innerHTML = '<div class="empty"><p>没有工具匹配当前筛选组合</p><p style="font-size:12px;margin-top:8px"><a class="reset-link" onclick="resetDims()" title="清除所有筛选条件">← 重置全部筛选</a></p></div>';
    return;
  }

  grid.innerHTML = sorted.map(function(t){ return renderCard(t); }).join('');
}

// ── 卡片组件：原型绿头通栏（分类/形态/归属 已剥离进 dim 块与编辑面板） ──
// state 来自 scanTools 的 t.state，前端不再靠条件分支猜状态

var STATE_META = {
  running:      { label:'运行中',   chip:'on' },
  stopped:      { label:'已停止',   chip:'off' },
  start_failed: { label:'启动失败', chip:'start_failed' },
  starting:     { label:'启动中',   chip:'starting' },
  halting:      { label:'停止中',   chip:'halting' },
  broken:       { label:'配置损坏', chip:'broken' },
  incomplete:   { label:'字段不全', chip:'incomplete' },
  orphan:       { label:'未注册',   chip:'orphan' },
  stale_path:   { label:'路径失效', chip:'stale_path' },
  disabled:     { label:'已停用',   chip:'disabled', dot:'off' }
};

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) { return escHtml(s).replace(/"/g,'&quot;'); }

function classifyState(t) {
  if (starting[t.id]) return 'starting';
  if (stopping[t.id]) return 'halting';
  return t.state || (t.running ? 'running' : 'stopped');
}

var TOOL_LOGO = { 'capability-map': '/shared/logos/capability-map.svg' };

function renderCard(t) {
  var state = classifyState(t);
  var ico = t.icon || (t.name || t.id).trim().charAt(0);
  var logo = TOOL_LOGO[t.id];
  var icoHtml = logo ? '<img src="' + logo + '" alt="">' : escHtml(ico);
  var extraClass = (t.disabled && state !== 'disabled') ? ' st-disabled' : '';
  return '<div class="tool-card st-' + state + extraClass + '" data-id="' + t.id + '">'
    + '<div class="card-top"><span class="card-ico">' + icoHtml + '</span><div class="card-name">' + escHtml(t.name || t.id) + '</div><span class="card-drag-handle" draggable="true" title="拖拽排序"></span></div>'
    + metaRowHtml(t, state)
    + actionsHtml(t, state)
    + '</div>';
}

function statusDots(t) {
  var children = t.children || [];
  var tasks = children.filter(function(c){ return c.type !== 'section'; });
  return tasks.map(function(c){
    var st = getCronChildStatus(c.name);
    var cls = st ? st.cls : 'idle';
    return '<span class="gc-dot ' + cls + '" title="' + escAttr(c.name + ': ' + (st ? st.label : 'idle')) + '">●</span>';
  }).join('');
}

function metaRowHtml(t, state) {
  var ports = t.ports || (t.port ? [t.port] : []);
  var portHtml = ports.length ? escHtml(ports.join(' :')) : '—';
  var isGroup = t.type === 'group';
  var desc = (t.description || '—').replace(/(【)/g, '\n$1').replace(/^\n/, '');
  return '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">ID</span><span class="card-id">' + escHtml(t.id) + '</span></span>'
    + '<span class="cf"><span class="cf-l">端口</span><span class="card-port">' + portHtml + '</span>' + (isGroup ? statusDots(t) : '') + '</span>'
    + '<span class="cf"><span class="cf-l">功能</span><span class="card-desc' + (t.description ? '' : ' placeholder') + '" data-tip="' + escAttr(t.description || '') + '">' + escHtml(desc) + '</span></span>'
    + '</div>';
}

function actionsHtml(t, state) {
  var v = isVirtual(t);
  var hasCommands = t.startCommand || t.stopCommand;
  var portCount = (t.ports && t.ports.length) || (t.port ? 1 : 0);
  var isNoPortCli = portCount === 0 && hasCommands;
  var isCli = t.type === 'cli' || t.type === 'command';
  var isFolder = t.type === 'folder';
  var isSelf = t.id === 'dashboard';
  var btns = [];

  if (state === 'start_failed') {
    btns.push('<button class="btn fix" onclick="event.stopPropagation();viewLogs(\'' + t.id + '\')">查看日志</button>');
    btns.push('<button class="btn go" onclick="event.stopPropagation();startTool(\'' + t.id + '\')">重试启动</button>');
  } else if (state === 'broken') {
    btns.push('<button class="btn fix" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'fix\')">修复 manifest</button>');
  } else if (state === 'incomplete') {
    btns.push('<button class="btn fix" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'complete\')">补全字段</button>');
  } else if (state === 'orphan') {
    btns.push('<button class="btn fix" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'register\')">注册为工具</button>');
  } else if (state === 'stale_path') {
    btns.push('<button class="btn fix" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'migrate\')">迁移路径</button>');
  } else if (state === 'starting') {
    btns.push('<button class="btn go starting" disabled>启动中…</button>');
  } else if (state === 'halting') {
    btns.push('<span class="card-placeholder">正在停止…</span>');
  } else if (isFolder) {
    btns.push('<button class="btn go" onclick="event.stopPropagation();window.open(\'/workspace/' + t.id + '\', \'_blank\')">查看项目</button>');
  } else if (isCli) {
    if (hasCommands) btns.push('<button class="btn go" onclick="event.stopPropagation();startTool(\'' + t.id + '\')">运行</button>');
    else btns.push('<span class="cmd-hint">在 Claude Code 中输入</span>');
  } else if (state === 'running') {
    btns.push('<button class="btn stop" onclick="event.stopPropagation();stopTool(\'' + t.id + '\')">停止</button>');
  } else if (state === 'stopped') {
    if (hasCommands && !isSelf && !isCli) {
      btns.push('<button class="btn go" onclick="event.stopPropagation();startTool(\'' + t.id + '\')">' + (isNoPortCli ? '终端' : '启动') + '</button>');
    }
  }

  var isOpened = opened[t.id];
  if (t.url && (t.running || v)) {
    btns.push('<a href="' + escAttr(t.url) + '" target="_blank" class="btn ' + (isOpened ? 'open-done' : 'open') + '" onclick="event.preventDefault();event.stopPropagation();verifyAndOpen(event.target,\'' + t.id + '\',\'' + escAttr(t.url) + '\')">' + (isOpened ? '打开中' : '打开') + '</a>');
  }
  if (t.publicUrl) {
    btns.push('<a href="' + escAttr(t.publicUrl) + '" target="_blank" class="btn pub" title="公网站点">公网 ↗</a>');
  }
  btns.push('<button class="btn edit" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'edit\')">编辑</button>');

  var toggle = '<label class="toggle-sm" onclick="event.stopPropagation();toggleDisabled(\'' + t.id + '\')"><input type="checkbox"' + (t.disabled ? '' : ' checked') + '><span class="toggle-track' + (t.disabled ? '' : ' on') + '"></span><span class="toggle-label' + (t.disabled ? '' : ' on') + '">' + (v ? '接入' : (t.disabled ? '停用' : '启用')) + '</span></label>';

  return '<div class="card-actions">' + btns.join('') + '<span class="p4-spacer"></span>' + toggle + '</div>';
}

function getCronChildStatus(childName) {
  if (!cronState || !cronState.jobs) return null;
  var job = cronState.jobs.find(function(j) { return j.name.indexOf(childName) !== -1; });
  if (!job) return null;
  var ts = cronState.state && cronState.state.tasks ? cronState.state.tasks[job.id] : null;
  if (!ts || !ts.lastStatus) return { cls: 'idle', label: 'idle' };
  switch (ts.lastStatus) {
    case 'success': return { cls: 'success', label: '成功' };
    case 'error': return { cls: 'error', label: '失败(' + (ts.consecutiveErrors || 0) + '次)' };
    case 'fatal_error': return { cls: 'fatal_error', label: '今日已停止' };
    case 'output_missing': return { cls: 'output_missing', label: '产出缺失' };
    default: return { cls: 'unknown', label: ts.lastStatus };
  }
}

function markOpened(id) {
  opened[id] = true;
  try { sessionStorage.setItem('opened', JSON.stringify(opened)); } catch(_) {}
  updateCounts();
  render();
}

// Pre-flight HTTP check before opening service panel
async function verifyAndOpen(btn, id, url) {
  var origText = btn.textContent;
  btn.textContent = '探测中…';
  btn.style.opacity = '0.6';
  btn.style.pointerEvents = 'none';
  try {
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, 4000);
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(t);
    // mode:no-cors gives opaque response — can't read status. Only network errors throw.
    markOpened(id);
    window.open(url, '_blank');
  } catch (e) {
    showToast(id + ' 无法访问 — 服务端口在监听但 HTTP 无响应，可能启动中或已崩溃');
  }
  btn.textContent = origText;
  btn.style.opacity = '';
  btn.style.pointerEvents = '';
}

/* ── 侧边栏工具架可折叠：展开快捷跳转子栏；拖卡片到「工具架」按钮即添加，子项右侧 × 删除 ── */
var TOOLS_SUB_DEFAULT = ['claude-catalog', 'catalog', 'source-rack'];
function loadToolsSub() {
  try {
    var v = JSON.parse(localStorage.getItem('agentboard-tools-sub-list') || 'null');
    if (Array.isArray(v)) return v.filter(function(id){ return typeof id === 'string'; });
  } catch(_) {}
  return TOOLS_SUB_DEFAULT.slice();
}
function saveToolsSub(list) {
  try { localStorage.setItem('agentboard-tools-sub-list', JSON.stringify(list)); } catch(_) {}
}
function toggleToolsSub(force) {
  var sub = document.getElementById('toolsSub');
  if (!sub) return;
  var open = force != null ? !!force : !sub.classList.contains('open');
  sub.classList.toggle('open', open);
  var caret = document.getElementById('toolsCaret');
  if (caret) caret.textContent = open ? '▾' : '▸';
  try { localStorage.setItem('agentboard-tools-sub', open ? '1' : '0'); } catch(_) {}
}
function toolsNavClick() {
  var toolsPage = document.getElementById('page-tools');
  if (!toolsPage.classList.contains('show')) showPage('tools');
  toggleToolsSub();
}
function quickPreview(id) {
  var t = tools.find(function(x){ return x.id === id; });
  if (t && t.url) window.open(t.url, '_blank');
}
function renderToolsSub() {
  var sub = document.getElementById('toolsSub');
  if (!sub) return;
  var list = loadToolsSub();
  if (!list.length) {
    sub.innerHTML = '<div class="nav-sub-hint">拖卡片到「工具架」加入快捷</div>';
    return;
  }
  sub.innerHTML = list.map(function(id){
    var t = tools.find(function(x){ return x.id === id; });
    var label = t && t.name ? t.name : id;
    return '<div class="nav-sub-item" title="' + escAttr(t && t.url ? t.url : '') + '" onclick="quickPreview(\'' + id + '\')">'
      + '<span class="nav-sub-label">' + escHtml(label) + '</span>'
      + '<span class="nav-sub-del" title="移除快捷" onclick="event.stopPropagation();deleteToolsSubItem(\'' + id + '\')">×</span>'
      + '</div>';
  }).join('');
}
function addToolsSub(id) {
  var t = tools.find(function(x){ return x.id === id; });
  if (!t) { toast('工具不存在'); return; }
  if (!t.url) { toast('「' + (t.name || id) + '」无跳转地址，不可加入快捷'); return; }
  var list = loadToolsSub();
  if (list.indexOf(id) !== -1) { toast('已在快捷栏'); return; }
  list.push(id);
  saveToolsSub(list);
  renderToolsSub();
  toggleToolsSub(true);
  toast('已加入快捷栏：' + (t.name || id));
}
function deleteToolsSubItem(id) {
  var t = tools.find(function(x){ return x.id === id; });
  var name = t && t.name ? t.name : id;
  if (!confirm('从工具架快捷栏移除「' + name + '」？')) return;
  var list = loadToolsSub().filter(function(x){ return x !== id; });
  saveToolsSub(list);
  renderToolsSub();
  toast('已移除：' + name);
}

function pollUntil(id, wantRunning, maxTries) {
  maxTries = maxTries || 30;
  var tries = 0;
  function check() {
    fetch('/api/tools').then(function(r){ return r.json(); }).then(function(data){
      if (!data.ok) return;
      var t = data.tools.find(function(x){ return x.id === id; });
      if (t && t.running === wantRunning) {
        tools = data.tools;
        if (wantRunning) delete starting[id]; else delete stopping[id];
        updateCounts();
        buildDimBlocks();
        render();
        return;
      }
      tries++;
      if (tries >= maxTries) {
        if (wantRunning) delete starting[id]; else delete stopping[id];
        fetchTools();
        return;
      }
      setTimeout(check, 500);
    }).catch(function(){
      tries++;
      if (tries >= maxTries) {
        if (wantRunning) delete starting[id]; else delete stopping[id];
        fetchTools();
        return;
      }
      setTimeout(check, 500);
    });
  }
  setTimeout(check, 500);
}

async function startTool(id) {
  starting[id] = true;
  render();
  try {
    var res = await fetch('/api/tools/start/' + id, {method:'POST'});
    var data = await res.json();
    if (data.ok) {
      pollUntil(id, true);
    } else {
      delete starting[id];
      render();
      alert('启动失败: ' + (data.error||'未知错误'));
    }
  } catch(e) {
    delete starting[id];
    render();
    alert('连接失败');
  }
}

async function stopTool(id) {
  // 确认机制：第一次点变"确认停止？"，2秒内再点才执行
  var stopBtn = document.querySelector('.tool-card[data-id="' + id + '"] .btn.stop');
  if (stopBtn && !stopBtn.classList.contains('confirming')) {
    stopBtn.textContent = '确认停止？';
    stopBtn.classList.add('confirming');
    setTimeout(function(){
      if (stopBtn.classList.contains('confirming')) {
        stopBtn.textContent = '停止';
        stopBtn.classList.remove('confirming');
      }
    }, 2000);
    return;
  }
  stopping[id] = true;
  render();
  try {
    var res = await fetch('/api/tools/stop/' + id, {method:'POST'});
    var data = await res.json();
    if (data.ok) {
      pollUntil(id, false);
    } else {
      delete stopping[id];
      render();
      alert('停止失败: ' + (data.error||'未知错误'));
    }
  } catch(e) {
    delete stopping[id];
    render();
    alert('连接失败');
  }
}

async function toggleDisabled(id) {
  var t = tools.find(function(x){return x.id===id;});
  if (!t) return;
  var newVal = !t.disabled;
  try {
    var res = await fetch('/api/tools/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({disabled: newVal})});
    var data = await res.json();
    if (data.ok) { fetchTools(); }
  } catch(e) { console.error('toggleDisabled:', e); }
}

/* ── 我的网站 ── */
async function renderApps() {
  if (!tools.length) { try { await fetchTools(); } catch (e) {} }  // devTool 派生本地开发需要工具列表
  try {
    var res = await fetch('/api/apps');
    var data = await res.json();
    if (data.ok) { appsData = data.apps || []; updateCounts(); paintApps(); }
    else document.getElementById('appGrid').innerHTML = '<div class="empty">应用加载失败：' + escHtml(data.error || '') + '</div>';
  } catch(e) {
    document.getElementById('appGrid').innerHTML = '<div class="empty">应用加载失败</div>';
  }
}
function paintApps() {
  var grid = document.getElementById('appGrid'); if (!grid) return;
  if (!appsData.length) { grid.innerHTML = '<div class="empty">还没有网站 —— 点上方 + 添加网站。</div>'; return; }
  grid.innerHTML = appsData.map(appCard).join('');
}
function appDomainOf(a) {
  return (a.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}
// 本地开发地址从 devTool 指向的工具卡 port 派生（真相源 = tools/{id}/manifest.json，不在 apps 卡存副本）
function appDevHtml(a) {
  if (!a.devTool) return '';
  var t = null;
  (tools || []).forEach(function (x) { if (x.id === a.devTool) t = x; });
  if (!t || !t.port) return '';
  return 'localhost:' + t.port;
}
function appCard(a) {
  var ico = a.name ? a.name.trim().charAt(0) : '站';
  var desc = a.description || '—';
  var dev = appDevHtml(a);
  return '<div class="tool-card" data-id="' + escAttr(a.id) + '">'
    + '<div class="card-top"><span class="card-ico">' + escHtml(ico) + '</span><div class="card-name">' + escHtml(a.name) + '</div><span class="card-drag-handle" draggable="true" title="拖拽排序"></span></div>'
    + '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">域名</span><a class="card-domain" href="' + escAttr(a.url || '#') + '" target="_blank" data-tip="' + escAttr(a.url || '') + '">' + escHtml(appDomainOf(a)) + ' ↗</a></span>'
    + '<span class="cf"><span class="cf-l">托管</span><span class="card-val">' + escHtml(a.host || '—') + '</span></span>'
    + (dev ? '<span class="cf"><span class="cf-l">本地</span><span class="card-val">' + escHtml(dev) + '</span></span>' : '')
    + '<span class="cf"><span class="cf-l">描述</span><span class="card-desc' + (a.description ? '' : ' placeholder') + '" data-tip="' + escAttr(a.description || '') + '">' + escHtml(desc) + '</span></span>'
    + '</div>'
    + '<div class="card-actions">'
    + (a.url ? '<a class="btn open" href="' + escAttr(a.url) + '" target="_blank">打开</a>' : '')
    + '<button class="btn edit" onclick="openEditApp(\'' + escAttr(a.id) + '\')">编辑</button>'
    + '<button class="btn del" onclick="deleteApp(\'' + escAttr(a.id) + '\')">删除</button>'
    + '<span class="p4-spacer"></span>'
    + '</div>'
    + '</div>';
}
/* apps 拖拽排序：六点手柄触发（对齐 scheduler），事件委托在 #appGrid，drop 后按 DOM 顺序批量写 order */
var appDragId = null;
function onAppGridDragStart(e) {
  if (!e.target.closest('.card-drag-handle')) { e.preventDefault(); return; }
  var card = e.target.closest('.tool-card');
  if (!card || !card.getAttribute('data-id')) return;
  appDragId = card.getAttribute('data-id');
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', appDragId);
}
function onAppGridDragOver(e) {
  e.preventDefault();
  if (!appDragId) return;
  var card = e.target.closest('.tool-card');
  if (!card || card.getAttribute('data-id') === appDragId) return;
  e.dataTransfer.dropEffect = 'move';
  card.classList.add('drag-over');
}
function onAppGridDragLeave(e) {
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('drag-over');
}
function onAppGridDrop(e) {
  e.preventDefault();
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('drag-over');
  if (!appDragId || !card || card.getAttribute('data-id') === appDragId) return;
  var grid = document.getElementById('appGrid');
  var src = grid.querySelector('.tool-card[data-id="' + appDragId + '"]');
  if (!src) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.tool-card'));
  var srcIdx = cards.indexOf(src);
  var dstIdx = cards.indexOf(card);
  if (srcIdx < dstIdx) card.parentNode.insertBefore(src, card.nextSibling);
  else card.parentNode.insertBefore(src, card);
  var ids = appGridOrder();
  if (ids.length) persistAppOrder(ids);
}
function onAppGridDragEnd() {
  var grid = document.getElementById('appGrid');
  if (grid) {
    var s = grid.querySelector('.tool-card.dragging');
    if (s) s.classList.remove('dragging');
    var overs = grid.querySelectorAll('.tool-card.drag-over');
    for (var i = 0; i < overs.length; i++) overs[i].classList.remove('drag-over');
  }
  appDragId = null;
}
function appGridOrder() {
  var grid = document.getElementById('appGrid');
  if (!grid) return [];
  return Array.prototype.map.call(grid.querySelectorAll('.tool-card[data-id]'), function (c) { return c.getAttribute('data-id'); });
}
function persistAppOrder(ids) {
  fetch('/api/apps/reorder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) { appsData = null; renderApps(); toast('已保存排序'); }
    else toast('排序保存失败：' + (d.error || ''));
  }).catch(function (e) { toast('排序保存失败：' + e.message); });
}

/* ── 工具架拖拽排序：六点手柄（对齐 apps），事件委托在 #toolGrid，drop 后算全局序写 localStorage['agentboard-card-order'] ── */
var serverCardOrder = null;   // 服务端排序真相源（/api/tools/order），boot 载入后优先于 localStorage
function loadLocalCardOrder() {
  var cardOrder = [];
  try { cardOrder = JSON.parse(localStorage.getItem('agentboard-card-order') || '[]'); } catch (_) {}
  return Array.isArray(cardOrder) ? cardOrder : [];
}
function loadCardOrder() {
  if (serverCardOrder) return serverCardOrder;
  return loadLocalCardOrder();
}
// 拖拽后把全序写服务端（state/tools-card-order.json）——换 localhost/127.0.0.1、换浏览器都不丢；localStorage 只作离线兜底
function persistServerOrder(order) {
  try {
    fetch('/api/tools/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: order }) }).catch(function(){});
  } catch(_) {}
}
async function loadServerCardOrder() {
  try {
    var res = await fetch('/api/tools/order');
    var d = await res.json();
    if (d.ok && Array.isArray(d.order) && d.order.length) {
      serverCardOrder = d.order;
      try { localStorage.setItem('agentboard-card-order', JSON.stringify(d.order)); } catch(_) {}
      render();
    } else {
      // 服务端空 + 本地已有旧序：推上去完成迁移（升级后换入口不丢）
      var local = loadLocalCardOrder();
      if (local && local.length) persistServerOrder(local);
    }
  } catch(_) { /* 服务端不可达：保持 localStorage 兜底 */ }
}
// render() 排序与拖拽落盘共用的比较器：用户排列优先 → 已停用沉底 → 新卡按 分类→运行→order 兜底
function compareTools(a, b, cardOrder) {
  var da = a.disabled ? 1 : 0;
  var db = b.disabled ? 1 : 0;
  if (da !== db) return da - db;
  var ai = cardOrder.indexOf(a.id);
  var bi = cardOrder.indexOf(b.id);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  var catOrder = {'模型':0, 'Agent':1, '设施':2, '获取':3, '查阅':4, '创作':5, '职能':6};
  var ca = catOrder[a.category] != null ? catOrder[a.category] : 99;
  var cb = catOrder[b.category] != null ? catOrder[b.category] : 99;
  if (ca !== cb) return ca - cb;
  if (a.running && !b.running) return -1;
  if (!a.running && b.running) return 1;
  return (a.order||99) - (b.order||99);
}
var toolDragId = null;
function onToolGridDragStart(e) {
  if (!e.target.closest('.card-drag-handle')) { e.preventDefault(); return; }
  var card = e.target.closest('.tool-card');
  if (!card || !card.getAttribute('data-id')) return;
  toolDragId = card.getAttribute('data-id');
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', toolDragId);
}
function onToolGridDragOver(e) {
  e.preventDefault();
  if (!toolDragId) return;
  var card = e.target.closest('.tool-card');
  if (!card || card.getAttribute('data-id') === toolDragId) return;
  e.dataTransfer.dropEffect = 'move';
  card.classList.add('drag-over');
}
function onToolGridDragLeave(e) {
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('drag-over');
}
function onToolGridDrop(e) {
  e.preventDefault();
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('drag-over');
  if (!toolDragId || !card || card.getAttribute('data-id') === toolDragId) return;
  var grid = document.getElementById('toolGrid');
  var src = grid.querySelector('.tool-card[data-id="' + toolDragId + '"]');
  if (!src) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.tool-card'));
  var srcIdx = cards.indexOf(src);
  var dstIdx = cards.indexOf(card);
  if (srcIdx < dstIdx) card.parentNode.insertBefore(src, card.nextSibling);
  else card.parentNode.insertBefore(src, card);
  persistToolOrder(grid);
}
function onToolGridDragEnd() {
  var grid = document.getElementById('toolGrid');
  if (grid) {
    var s = grid.querySelector('.tool-card.dragging');
    if (s) s.classList.remove('dragging');
    var overs = grid.querySelectorAll('.tool-card.drag-over');
    for (var i = 0; i < overs.length; i++) overs[i].classList.remove('drag-over');
  }
  toolDragId = null;
}
// 拖拽后落盘：只重排可见卡（当前筛选下），不可见卡保持原位 → 全序写 localStorage，render 排序直接消费
function persistToolOrder(gridEl) {
  var visible = Array.prototype.map.call(gridEl.querySelectorAll('.tool-card[data-id]'), function (c) { return c.getAttribute('data-id'); });
  if (!visible.length) return;
  var cardOrder = loadCardOrder();
  var full = tools.slice().sort(function (a, b) { return compareTools(a, b, cardOrder); }).map(function (t) { return t.id; });
  var visIdx = 0, out = [];
  for (var i = 0; i < full.length; i++) {
    if (visible.indexOf(full[i]) !== -1) out.push(visible[visIdx++]);
    else out.push(full[i]);
  }
  localStorage.setItem('agentboard-card-order', JSON.stringify(out));
  serverCardOrder = out;
  persistServerOrder(out);
  render();
  toast('已保存排序');
}

/* ── 原则库（决策框架，经验日志同款呈现） ── */
var PRINC_DEFS=[['all','全部'],['review','审查'],['design','设计'],['architecture','架构'],['governance','治理'],['engineering','工程'],['communication','沟通']];
var PRINC_CHAR={'review':'审','design':'设','architecture':'构','governance':'治','engineering':'工','communication':'沟'};
var PRINC_LABEL={'review':'审查方法','design':'设计原则','architecture':'架构决策','governance':'治理','engineering':'工程','communication':'沟通'};

async function renderPrinciples() {
  if (!princData) {
    try {
      var res = await fetch('/api/principles');
      var data = await res.json();
      if (!data.ok) { document.getElementById('princGrid').innerHTML = '<div class="empty">原则加载失败</div>'; return; }
      princData = data.principles || [];
      updateCounts();
    } catch(e) { document.getElementById('princGrid').innerHTML = '<div class="empty">原则加载失败</div>'; return; }
  }
  renderPrincDims();
  var q = (document.getElementById('princSearch') ? document.getElementById('princSearch').value : '').trim().toLowerCase();
  var list = princData.filter(function(x){
    if (princF !== 'all' && x.type !== princF) return false;
    if (q && (x.title + ' ' + x.what + ' ' + x.desc + ' ' + x.file).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  document.getElementById('princGrid').innerHTML = list.length ? list.map(princCard).join('') : '<div class="empty">没有匹配的原则</div>';
}
function renderPrincDims() {
  var el = document.getElementById('princDimBlocks'); if (!el) return;
  var counts = {};
  (princData || []).forEach(function(x){ counts[x.type] = (counts[x.type] || 0) + 1; });
  var html = '<div class="dim-block" style="--b:#EEF4EF"><div class="dim-block-title">类型<span class="dim-arr">></span></div><div class="dim-block-opts">';
  PRINC_DEFS.forEach(function(d){
    var cnt = d[0] === 'all' ? (princData || []).length : (counts[d[0]] || 0);
    html += '<span class="dim-opt' + (princF === d[0] ? ' active' : '') + '" onclick="setPrincF(\'' + d[0] + '\')">' + d[1] + '<span class="d-n">' + cnt + '</span></span>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}
function setPrincF(f) { princF = f; renderPrinciples(); }
function princCard(x) {
  return '<div class="tool-card tip-card">'
    + '<div class="card-top"><span class="card-ico">' + (PRINC_CHAR[x.type] || '则') + '</span><div class="card-name">' + escHtml(x.title) + '</div></div>'
    + '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">类型</span><span class="tip-type" data-type="' + (x.type || '') + '"><span>' + escHtml(PRINC_LABEL[x.type] || x.type || '原则') + '</span></span></span>'
    + '<span class="cf"><span class="cf-l">文件</span><span class="card-id">' + escHtml(x.file) + '</span></span>'
    + '<span class="cf top"><span class="cf-l">内容</span><span class="tip-desc-cell">' + escHtml(x.what || x.desc || '—') + '</span></span>'
    + '</div>'
    + '<div class="card-actions"><span class="p4-spacer"></span><button class="btn edit" onclick="openEditPrinc(\'' + escAttr(x.file) + '\')">编辑</button><button class="btn del" onclick="deletePrinc(\'' + escAttr(x.file) + '\')">删除</button></div>'
    + '</div>';
}

// ── 通用字段渲染（principles/tools 表单共用；apps 表单专属 custom/dynamic 逻辑不动） ──
function renderFieldHtml(f, id) {
  var req = f.required ? ' <span class="req">*</span>' : '';
  var tip = f.tooltip ? ' title="' + escAttr(f.tooltip) + '"' : '';
  var oc = f.onchange ? ' onchange="' + escAttr(f.onchange) + '"' : '';
  var lab = '<label' + tip + '>' + escHtml(f.label) + req + '</label>';
  var ctrl;
  var ph = (f.placeholder || '').replace(/\n/g, '&#10;');
  if (f.type === 'textarea') {
    ctrl = '<textarea id="' + id + '" rows="' + (f.rows || 2) + '" placeholder="' + escAttr(ph) + '"' + oc + (f.taClass ? ' class="' + f.taClass + '"' : '') + '></textarea>';
  } else if (f.type === 'select') {
    ctrl = '<select id="' + id + '"' + oc + '>' + (f.options || []).map(function(o) {
      var t = (typeof o === 'object' && o.title) ? ' title="' + escAttr(o.title) + '"' : '';
      return '<option value="' + escAttr(optVal(o)) + '"' + t + '>' + escHtml(optLabel(o)) + '</option>';
    }).join('') + '</select>';
  } else if (f.type === 'date') {
    ctrl = '<input id="' + id + '" type="date">';
  } else if (f.type === 'checkbox') {
    return '<div class="check-row"' + (f.rowId ? ' id="' + f.rowId + '"' : '') + '><input type="checkbox" id="' + id + '"' + oc + '><span' + tip + '>' + escHtml(f.label) + '</span></div>';
  } else {
    ctrl = '<input id="' + id + '" type="text" placeholder="' + escAttr(f.placeholder || '') + '"' + oc + '>';
  }
  return '<div class="field">' + lab + ctrl + '</div>';
}

/* ── 原则库 新增/编辑/删除（schema 驱动：字段来自 /api/principles/schema） ── */
var princModalState = 'new';  // new | edit
var princEditingFile = null;
var princFields = null;  // 表单字段契约（lib/principle-schema.js → /api/principles/schema）
var princFieldsRendered = false;
async function ensurePrincSchema() {
  if (princFields) return princFields;
  try {
    var res = await fetch('/api/principles/schema');
    var data = await res.json();
    princFields = (data.ok && data.schema && data.schema.fields) || [];
  } catch (e) { princFields = []; }
  return princFields;
}
function princInputId(key) { return 'pp-' + key; }
function princVal(key) { var el = document.getElementById(princInputId(key)); return el ? el.value.trim() : ''; }
function princSet(key, v) { var el = document.getElementById(princInputId(key)); if (el) el.value = v == null ? '' : v; }
function renderPrincFields() {
  if (princFieldsRendered || !princFields.length) return;
  document.getElementById('princFields').innerHTML = princFields.map(function(f) { return renderFieldHtml(f, princInputId(f.key)); }).join('');
  princFieldsRendered = true;
}
var PRINC_SEC_NAMES = { '是什么': 'what', '怎么用': 'how', '案例': 'case', '边界': 'edge' };
function parsePrincSections(body) {
  var sec = { what: '', how: '', case: '', edge: '' };
  var cur = null;
  body.split('\n').forEach(function(line) {
    var m = line.match(/^## (?![\s#])(.+)$/);
    if (m) { cur = PRINC_SEC_NAMES[m[1].trim()] || cur; return; }
    if (!cur) cur = 'what';
    if (sec[cur] !== undefined) sec[cur] += line + '\n';
  });
  ['what', 'how', 'case', 'edge'].forEach(function(k) { sec[k] = sec[k].trim(); });
  return sec;
}
function princToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function openNewPrinc() {
  await ensurePrincSchema();
  renderPrincFields();
  princModalState = 'new'; princEditingFile = null;
  document.getElementById('princModalTitle').textContent = '新增原则';
  princSet('type', 'review');
  princSet('title', '');
  princSet('date', princToday());
  princSet('source', '');
  princSet('what', '');
  princSet('how', '');
  princSet('case', '');
  princSet('edge', '');
  document.getElementById('princModal').style.display = 'flex';
}
async function openEditPrinc(file) {
  await ensurePrincSchema();
  renderPrincFields();
  princModalState = 'edit'; princEditingFile = file;
  document.getElementById('princModalTitle').textContent = '编辑原则';
  document.getElementById('princModal').style.display = 'flex';
  try {
    var res = await fetch('/api/principles/' + encodeURIComponent(file));
    if (!res.ok) { toast('读取失败：' + res.status); return; }
    var md = (await res.text()).replace(/\r\n/g, '\n');
    var type = 'review', date = '', source = '', title = '', rest = md;
    var fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
      var t = fm[1].match(/^type:\s*(.+)$/m); if (t) type = t[1].trim();
      var d = fm[1].match(/^date:\s*(.+)$/m); if (d) date = d[1].trim();
      var s = fm[1].match(/^source:\s*(.+)$/m); if (s) source = s[1].trim();
      rest = md.slice(fm[0].length);
    }
    var h1 = rest.match(/^#\s+(.+)$/m);
    if (h1) { title = h1[1].trim(); rest = rest.slice(h1.index + h1[0].length).replace(/^\n+/, ''); }
    var sec = parsePrincSections(rest);
    princSet('type', type);
    princSet('date', date);
    princSet('source', source);
    princSet('title', title);
    princSet('what', sec.what);
    princSet('how', sec.how);
    princSet('case', sec.case);
    princSet('edge', sec.edge);
  } catch(e) { toast('读取失败：' + e.message); }
}
function closePrincModal() { document.getElementById('princModal').style.display = 'none'; }
async function savePrinc() {
  var title = princVal('title');
  var type = princVal('type');
  var date = princVal('date');
  var source = princVal('source');
  var sec = {
    what: princVal('what'),
    how: princVal('how'),
    case: princVal('case'),
    edge: princVal('edge')
  };
  if (!title) return toast('标题必填');
  if (!sec.what || !sec.how) return toast('是什么 / 怎么用 必填');
  var missing = [];
  if (!sec.case) missing.push('案例');
  if (!sec.edge) missing.push('边界');
  if (missing.length && !confirm('「' + title + '」缺 ' + missing.join('、') + '，保存后对应段落会被跳过。继续？')) return;
  var body = { title: title, type: type, date: date, source: source, what: sec.what, how: sec.how, case: sec.case, edge: sec.edge };
  try {
    var res = await fetch(princModalState === 'edit' ? '/api/principles/' + encodeURIComponent(princEditingFile) : '/api/principles', {
      method: princModalState === 'edit' ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!data.ok) return toast('保存失败：' + (data.error || res.status));
    closePrincModal();
    princData = null;
    renderPrinciples();
  } catch(e) { toast('保存失败：' + e.message); }
}
function deletePrinc(file) {
  var x = null;
  (princData || []).forEach(function(p){ if (p.file === file) x = p; });
  if (!x) return;
  if (!confirm('删除原则「' + (x.title || file) + '」？此操作不可恢复。')) return;
  fetch('/api/principles/' + encodeURIComponent(file), { method: 'DELETE' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) { princData = null; renderPrinciples(); toast('已删除'); }
      else toast('删除失败：' + (d.error || ''));
    })
    .catch(function(e){ toast('删除失败：' + e.message); });
}

/* ── 我的网站 增/改/删（schema 驱动：字段来自 /api/apps/schema，禁止手写副本） ── */
var appModalState = 'new';  // new | edit
var appEditingId = null;
var appFields = null;  // 表单字段契约（lib/apps-schema.js → /api/apps/schema）
async function ensureAppSchema() {
  if (appFields) return appFields;
  try {
    var res = await fetch('/api/apps/schema');
    var data = await res.json();
    appFields = (data.ok && data.schema && data.schema.fields) || [];
  } catch (e) { appFields = []; }
  return appFields;
}
// dynamic 字段（devTool）options 从 /api/tools 填充，一次即可
var appToolOptionsLoaded = false;
async function ensureAppToolOptions() {
  if (appToolOptionsLoaded) return;
  var list = tools;
  if (!list || !list.length) {
    try {
      var res = await fetch('/api/tools');
      var data = await res.json();
      if (data.ok) list = data.tools || [];
    } catch (e) { list = []; }
  }
  (appFields || []).forEach(function (f) {
    if (f.dynamic) f.options = [''].concat((list || []).filter(function (x) { return x.id; }).map(function (x) { return { value: x.id, label: (x.name || x.id) + ' · ' + x.id }; }));
  });
  appToolOptionsLoaded = true;
}
function optVal(o) { return typeof o === 'object' ? o.value : o; }
function optLabel(o) { return typeof o === 'object' ? o.label : o; }
function appFieldHtml(f) {
  var req = f.required ? ' <span class="req">*</span>' : '';
  if (f.type === 'textarea') {
    return '<div class="field"><label>' + f.label + req + '</label><textarea id="app-f-' + f.key + '" rows="' + (f.rows || 2) + '" placeholder="' + f.placeholder + '"></textarea></div>';
  }
  if (f.type === 'select') {
    var opts = (f.options || []).map(function (o) { return '<option value="' + optVal(o) + '">' + optLabel(o) + '</option>'; }).join('');
    if (f.custom) opts += '<option value="__custom__">自定义…</option>';
    var html = '<div class="field"><label>' + f.label + req + '</label><select id="app-f-' + f.key + '"' + (f.custom ? ' onchange="appCustomToggle(\'' + f.key + '\')"' : '') + '>' + opts + '</select>';
    if (f.custom) html += '<input id="app-f-' + f.key + '-custom" type="text" placeholder="' + f.customPlaceholder + '" style="display:none;margin-top:6px">';
    return html + '</div>';
  }
  return '<div class="field"><label>' + f.label + req + '</label><input id="app-f-' + f.key + '" type="' + f.type + '"' + (f.min !== undefined ? ' min="' + f.min + '"' : '') + ' placeholder="' + (f.placeholder || '') + '"></div>';
}
function renderAppFields() {
  document.getElementById('appFields').innerHTML = (appFields || []).map(appFieldHtml).join('');
}
function appVal(f) {
  var el = document.getElementById('app-f-' + f.key);
  if (!el) return '';
  if (f.type === 'select' && f.custom && el.value === '__custom__') {
    var c = document.getElementById('app-f-' + f.key + '-custom');
    return c ? c.value.trim() : '';
  }
  return el.value.trim();
}
function appCustomToggle(key) {
  var sel = document.getElementById('app-f-' + key);
  var c = document.getElementById('app-f-' + key + '-custom');
  if (c) c.style.display = sel.value === '__custom__' ? 'block' : 'none';
}
function resetAppForm() {
  (appFields || []).forEach(function (f) {
    var el = document.getElementById('app-f-' + f.key);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = f.options[0] !== undefined ? f.options[0] : '';
      if (f.custom) { var c = document.getElementById('app-f-' + f.key + '-custom'); if (c) c.style.display = 'none'; }
    } else el.value = '';
  });
}
function fillAppForm(a) {
  (appFields || []).forEach(function (f) {
    var el = document.getElementById('app-f-' + f.key);
    if (!el) return;
    var v;
    if (f.key === 'domain') v = (a.url || a.id || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    else v = a[f.key] === undefined ? '' : a[f.key];
    if (f.type === 'select') {
      var known = false;
      for (var i = 0; i < el.options.length; i++) { if (el.options[i].value === String(v)) { known = true; break; } }
      if (known) el.value = v;
      else if (f.custom) {
        el.value = '__custom__';
        var c = document.getElementById('app-f-' + f.key + '-custom');
        if (c) { c.value = v; c.style.display = 'block'; }
      } else el.value = f.options[0] || '';
    } else el.value = v;
  });
}
async function openAppModal() {
  appModalState = 'new'; appEditingId = null;
  document.getElementById('appModalTitle').textContent = '添加网站';
  await ensureAppSchema();
  await ensureAppToolOptions();
  renderAppFields();
  resetAppForm();
  document.getElementById('appModal').style.display = 'flex';
}
async function openEditApp(id) {
  var a = null;
  (appsData || []).forEach(function (x) { if (x.id === id) a = x; });
  if (!a) return;
  appModalState = 'edit'; appEditingId = id;
  document.getElementById('appModalTitle').textContent = '编辑网站';
  await ensureAppSchema();
  await ensureAppToolOptions();
  renderAppFields();
  fillAppForm(a);
  document.getElementById('appModal').style.display = 'flex';
}
function closeAppModal() { document.getElementById('appModal').style.display = 'none'; }
async function saveApp() {
  var missing = [];
  (appFields || []).forEach(function (f) { if (f.required && appVal(f) === '') missing.push(f.label); });
  if (missing.length) return toast('必填：' + missing.join('、'));
  var body = {};
  (appFields || []).forEach(function (f) {
    var v = appVal(f);
    if (f.required || f.formOnly) body[f.key] = v;
    else if (v !== '') body[f.key] = v;
  });
  try {
    var res = await fetch(appModalState === 'edit' ? '/api/apps/' + encodeURIComponent(appEditingId) : '/api/apps', {
      method: appModalState === 'edit' ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!data.ok) return toast('保存失败：' + (data.error || res.status));
    closeAppModal();
    appsData = null;
    renderApps();
  } catch (e) { toast('保存失败：' + e.message); }
}
function deleteApp(id) {
  var a = null;
  (appsData || []).forEach(function(x){ if (x.id === id) a = x; });
  if (!a) return;
  if (!confirm('删除网站「' + (a.name || id) + '」？')) return;
  fetch('/api/apps/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) { appsData = null; renderApps(); toast('已删除'); }
      else toast('删除失败：' + (d.error || ''));
    })
    .catch(function(e){ toast('删除失败：' + e.message); });
}

/* ── 导航 + hash 路由（#page 或 #tools/key=val&key=val） ── */
var applyingHash = false;
function currentDimHash() {
  var parts = [];
  if (domainFilter !== 'all') parts.push('category=' + encodeURIComponent(domainFilter));
  if (accFilter !== 'all') parts.push('acc=' + encodeURIComponent(accFilter));
  if (stateFilter !== 'all') parts.push('state=' + encodeURIComponent(stateFilter));
  return parts.join('&');
}
function syncDimHash() {
  if (applyingHash) return;
  var kv = currentDimHash();
  var h = 'tools' + (kv ? '/' + kv : '');
  if (location.hash !== '#' + h) location.hash = h;
}
function applyHash() {
  var h = location.hash.slice(1);
  if (!h) return;
  var seg = h.split('/');
  var page = seg[0];
  var pg = document.getElementById('page-' + page);
  applyingHash = true;
  try { if (pg) showPage(page); } finally { applyingHash = false; }
  if (page !== 'tools' || !seg[1]) return;
  var dimMap = { category: 'domainFilter', acc: 'accFilter', state: 'stateFilter' };
  var touched = false;
  seg[1].split('&').forEach(function(pair) {
    var kv = pair.split('=');
    var varName = dimMap[kv[0]];
    var val = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
    if (varName && val) { window[varName] = val; touched = true; }
  });
  if (touched) { buildDimBlocks(); render(); }
}
window.addEventListener('hashchange', function() {
  applyingHash = true;
  try { applyHash(); } finally { applyingHash = false; }
});

function showPage(p){
  document.querySelectorAll('.page').forEach(function(s){ s.classList.remove('show'); });
  var pg = document.getElementById('page-' + p); if (pg) pg.classList.add('show');
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page') === p); });
  if (!applyingHash) {
    var target = p === 'tools' ? 'tools' + (currentDimHash() ? '/' + currentDimHash() : '') : p;
    if (location.hash !== '#' + target) location.hash = target;
  }
}

/* ── 治理审计：仿 #tips 三段式——按钮巡检 → 分类组件 → 三类全出明细，点分类可筛，不自动轮询 ── */
var auditData = null;
var auditF = 'all'; // schema / brand / tree / docs / all
var auditS = 'all'; // err / warn / ok / all —— 总面板点击数字筛选
function auditInitial() {
  renderAuditDims();
  renderAudit();
}
function renderAuditDims() {
  var el = document.getElementById('auditDims');
  if (!el) return;
  var defs = [
    { key: 'schema', label: 'Manifest 契约' },
    { key: 'brand',  label: '品牌漂移' },
    { key: 'tree',   label: '三树一致性' },
    { key: 'docs',   label: '文档新鲜度' }
  ];
  var html = '<div class="dim-block" style="--b:#EEF4EF"><div class="dim-block-title">检查项<span class="dim-arr">></span></div><div class="dim-block-opts">';
  defs.forEach(function(d){
    html += '<span class="dim-opt' + (auditF === d.key ? ' active' : '') + '" onclick="setAuditF(\'' + d.key + '\')">' + d.label + '</span>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}
function setAuditF(f) {
  auditF = (auditF === f ? 'all' : f);
  renderAuditDims();
  renderAudit();
}
function runAudit() {
  var st = document.getElementById('auditStatus');
  var ts = document.getElementById('auditTs');
  if (st) st.textContent = '检查中…';
  if (ts) ts.textContent = '';
  fetch('/api/audit').then(function(r){ return r.json(); }).then(function(a){
    auditData = a;
    if (st) st.textContent = '巡检完成';
    if (ts) ts.textContent = '检查于 ' + new Date(a.updated).toLocaleString();
    renderAuditDims();
    renderAudit();
  }).catch(function(){
    if (st) st.textContent = '检查失败，请重试';
    renderAuditDims();
  });
}
function renderAudit() {
  var el = document.getElementById('auditGrid');
  if (!el) return;
  if (!auditData) {
    el.innerHTML = '<div class="audit-idle">点上方「开始巡检」按钮，手动跑一遍三处检查；每处结果可逐条核验</div>';
    return;
  }
  var html = auditSummaryHtml();
  if (auditF === 'all' || auditF === 'schema') html += auditSection('schema', 'Manifest 契约', '工具注册表格式——每份 manifest.json 必须符合固定字段，格式错了工具上架会缺信息、agent 定位不到；删了 manifest 或启动文件的孤儿目录也在这里报', auditData.schema, 'schema');
  if (auditF === 'all' || auditF === 'brand') html += auditSection('brand', '品牌漂移', '页面配色——token 色值必须与 vivi 设计系统一致，跑偏了换肤时颜色会错乱', auditData.brand, 'brand');
  if (auditF === 'all' || auditF === 'tree') html += auditSection('tree', '三树一致性', '文档目录——AGENTS.md / README / 说明书三份目录树必须跟真实文件对得上，对不上就是文档和代码脱节', auditData.tree, 'tree');
  if (auditF === 'all' || auditF === 'docs') html += auditSection('docs', '文档新鲜度', '页面清单——说明书 .pg 块、index.html AI 参考注释、AGENTS.md/README/说明书 routes 页数必须跟真实导航一致；加了页面忘了同步文档，这里兜住', auditData.docs, 'docs');
  el.innerHTML = html;
}
// 三类统一明细格式：项目名 → 错误(红) → 警告(黄) → 正常(绿)；列表先错误、再警告、正常垫底
function auditNormItems(s, kind) {
  if (!s || !s.items) return [];
  if (kind === 'schema') {
    return s.items.map(function(it){ return { name: it.name || it.id, errors: it.errors || [], warnings: it.warnings || [] }; });
  }
  return s.items.map(function(it){
    return { name: kind === 'tree' || kind === 'docs' ? it.doc + ' / ' + it.entry : it.file + ' · ' + it.check, errors: it.pass ? [] : [it.detail], warnings: [] };
  });
}
function auditStatus(it) {
  if (it.errors && it.errors.length) return 'err';
  if (it.warnings && it.warnings.length) return 'warn';
  return 'ok';
}
function auditSection(key, name, desc, s, kind) {
  var items = auditNormItems(s, kind).map(function(it){ return { name: it.name, errors: it.errors, warnings: it.warnings, st: auditStatus(it) }; });
  if (auditS !== 'all') {
    items = items.filter(function(it){ return it.st === auditS; });
    if (!items.length) return '';
  }
  var st = items.some(function(it){ return it.st === 'err'; }) ? 'err' : (items.some(function(it){ return it.st === 'warn'; }) ? 'warn' : 'ok');
  var errs = 0, warns = 0;
  items.forEach(function(it){ errs += it.errors.length; warns += it.warnings.length; });
  var meta = kind === 'schema' ? s.total + ' 项 · ' + errs + ' 错误 · ' + warns + ' 警告' : s.total + ' 项 · ' + errs + ' 错误';
  items.sort(function(a, b){ return (a.st === 'err' ? 0 : a.st === 'warn' ? 1 : 2) - (b.st === 'err' ? 0 : b.st === 'warn' ? 1 : 2); });
  var list = items.map(auditItemHtml).join('');
  var html = '<div class="audit-section ' + st + '">'
    + '<div class="audit-section-head"><span class="audit-section-name">' + name + '</span><span class="audit-section-meta">' + meta + '</span></div>'
    + '<div class="audit-section-desc">' + desc + '</div>'
    + '<div class="audit-items">' + list + '</div>'
    + '</div>';
  return html;
}
function auditItemHtml(it) {
  var html = '<div class="audit-item ' + it.st + '"><span class="dot"></span><span class="audit-item-name">' + escHtml(it.name) + '</span>';
  it.errors.forEach(function(e){ html += '<span class="audit-item-err">' + escHtml(e) + '</span>'; });
  it.warnings.forEach(function(w){ html += '<span class="audit-item-warn">' + escHtml(w) + '</span>'; });
  if (it.st === 'ok') html += '<span class="audit-item-ok">正常</span>';
  return html + '</div>';
}
function auditSummaryHtml() {
  var c = { err: 0, warn: 0, ok: 0 };
  var secs = [];
  if (auditF === 'all' || auditF === 'schema') secs.push(['schema', auditData.schema]);
  if (auditF === 'all' || auditF === 'brand') secs.push(['brand', auditData.brand]);
  if (auditF === 'all' || auditF === 'tree') secs.push(['tree', auditData.tree]);
  if (auditF === 'all' || auditF === 'docs') secs.push(['docs', auditData.docs]);
  secs.forEach(function(pair){ auditNormItems(pair[1], pair[0]).forEach(function(it){ c[auditStatus(it)]++; }); });
  function item(k, label) {
    return '<span class="audit-summary-item ' + k + (auditS === k ? ' active' : '') + '" onclick="setAuditS(\'' + k + '\')" title="点击只看' + label + '项，再点恢复"><span class="dot"></span>' + label + ' <b>' + c[k] + '</b></span>';
  }
  return '<div class="audit-summary">'
    + item('ok', '正常')
    + item('warn', '警告')
    + item('err', '错误')
    + '</div>';
}
function setAuditS(s) {
  auditS = (auditS === s ? 'all' : s);
  renderAudit();
}


/* ── 初始化 ── */
document.addEventListener('DOMContentLoaded', function() {
  var tipDesc = document.getElementById('tp-desc');
  if (tipDesc) tipDesc.addEventListener('input', function () { this.dataset.touched = '1'; });
  initToolForm();
  markOpened('dashboard');
  applyHash();
  var appGridEl = document.getElementById('appGrid');
  if (appGridEl) {
    appGridEl.addEventListener('dragstart', onAppGridDragStart);
    appGridEl.addEventListener('dragover', onAppGridDragOver);
    appGridEl.addEventListener('dragleave', onAppGridDragLeave);
    appGridEl.addEventListener('drop', onAppGridDrop);
    appGridEl.addEventListener('dragend', onAppGridDragEnd);
  }
  var toolGridEl = document.getElementById('toolGrid');
  if (toolGridEl) {
    toolGridEl.addEventListener('dragstart', onToolGridDragStart);
    toolGridEl.addEventListener('dragover', onToolGridDragOver);
    toolGridEl.addEventListener('dragleave', onToolGridDragLeave);
    toolGridEl.addEventListener('drop', onToolGridDrop);
    toolGridEl.addEventListener('dragend', onToolGridDragEnd);
  }
  try { if (localStorage.getItem('agentboard-tools-sub') === '1') toggleToolsSub(true); } catch(_) {}
  var toolsNav = document.getElementById('toolsNavItem');
  if (toolsNav) {
    toolsNav.addEventListener('dragover', function(e) {
      if (!toolDragId) return;
      e.preventDefault();
      toolsNav.classList.add('drag-over');
    });
    toolsNav.addEventListener('dragleave', function() { toolsNav.classList.remove('drag-over'); });
    toolsNav.addEventListener('drop', function(e) {
      e.preventDefault();
      toolsNav.classList.remove('drag-over');
      if (toolDragId) addToolsSub(toolDragId);
    });
  }
  renderToolsSub();
  ensureToolSchema();  // 分类筛选取值从 schema 派生（先拉，dim 块刷新）
  fetchTools();
  loadServerCardOrder();
  renderApps();
  TipsPanel.load();
  renderPrinciples();
  fetchCronState();
  auditInitial();
});

// ══ S5 人写面板：工具表单弹窗（新建/编辑/补全/迁移/修复/注册 一套）══

var tfFields = null;      // 表单字段契约（lib/manifest-schema.js → /api/tools/schema）
var tfCatSuggest = {};    // 分类 → 建议类型（schema 带）
var tfFieldsRendered = false;
async function ensureToolSchema() {
  if (tfFields) return tfFields;
  try {
    var res = await fetch('/api/tools/schema');
    var data = await res.json();
    if (data.ok && data.schema) {
      tfFields = data.schema.fields || [];
      tfCatSuggest = data.schema.catSuggest || {};
      dimCatValues = data.schema.categoryValues || [];
      var defs = data.schema.categoryDefinitions || {};
      dimCatTips = {};
      Object.keys(defs).forEach(function(c){ dimCatTips[c] = defs[c].desc || ''; });
      buildDimBlocks();
    }
  } catch (e) {}
  return tfFields;
}
var SEC_TIP = {
  '功能': '这工具干嘛',
  '分类': '选完自动建议类型，可改',
  '调用方式': '只显示当前类型该填的',
  '何时调用': '展开卡显示，AI 决定用它不用的依据'
};
function renderToolFields() {
  if (tfFieldsRendered || !tfFields.length) return;
  var html = '', curSec = null, secNum = 0, cgOpen = false, secOpen = false, i = 0;
  while (i < tfFields.length) {
    var f = tfFields[i];
    if (f.section !== curSec) {
      if (cgOpen) { html += '</div>'; cgOpen = false; }
      if (secOpen) { html += '</div>'; secOpen = false; }
      curSec = f.section; secNum++;
      html += '<div class="sec"><div class="sec-h"><span class="sec-num">' + secNum + '</span><span class="sec-title"' + (SEC_TIP[curSec] ? ' title="' + escAttr(SEC_TIP[curSec]) + '"' : '') + '>' + escHtml(curSec) + '</span></div>';
      secOpen = true;
    }
    if (f.cg) {
      if (cgOpen && cgOpen !== f.cg) { html += '</div>'; cgOpen = false; }
      if (!cgOpen) { html += '<div class="cg" id="cg-' + f.cg + '">'; cgOpen = f.cg; }
      html += renderToolField(f); i++;
      continue;
    }
    if (cgOpen) { html += '</div>'; cgOpen = false; }
    if (f.row) {
      var rowFields = [];
      while (i < tfFields.length && tfFields[i].row === f.row && !tfFields[i].cg && tfFields[i].section === f.section) { rowFields.push(tfFields[i]); i++; }
      html += renderFieldRow(rowFields);
      continue;
    }
    html += renderToolField(f); i++;
  }
  if (cgOpen) html += '</div>';
  if (secOpen) html += '</div>';
  document.getElementById('toolFields').innerHTML = html;
  buildIconPanel();
  attachToolFormListeners();
  tfFieldsRendered = true;
}
function renderFieldRow(fields) {
  if (fields.length >= 3) return '<div class="row3">' + fields.map(function(f){ return renderToolField(f); }).join('') + '</div>';
  if (fields.length === 2) return '<div class="row2">' + fields.map(function(f){ return renderToolField(f); }).join('') + '</div>';
  return fields.map(function(f){ return renderToolField(f); }).join('');
}
function renderToolField(f) {
  if (f.type === 'note') return '<div class="cg-note">' + escHtml(f.note || '') + '</div>';
  if (f.type === 'display') return '<div class="field"><label>' + escHtml(f.label) + '</label>' + (f.displayHtml || '<div class="auto-val" id="' + f.input + '">—</div>') + '</div>';
  if (f.type === 'icon') return iconFieldHtml(f);
  if (f.newOnly) return idFieldHtml(f);
  return renderFieldHtml(f, f.input);
}
function iconFieldHtml(f) {
  return '<div class="field"><label title="' + escAttr(f.tooltip || '') + '">' + escHtml(f.label) + '</label>' +
    '<div class="icon-row">' +
    '<input id="' + f.input + '" type="text" placeholder="' + escAttr(f.placeholder || '') + '">' +
    '<button type="button" class="btn" onclick="toggleIconPanel()">从库选</button>' +
    '</div><div id="icon-panel" style="display:none;margin-top:8px"></div></div>';
}
function idFieldHtml(f) {
  return '<div class="field"><label title="' + escAttr(f.tooltip || '') + '">' + escHtml(f.label) + ' <span class="req" id="id-req" style="display:none">*</span></label>' +
    '<input id="' + f.input + '" type="text" placeholder="' + escAttr(f.placeholder || '') + '" style="display:none">' +
    '<div class="auto-val" id="id-val" title="编辑已有：ID 锁定 = 当前目录名。改名 = 挪目录，需谨慎。">—</div></div>';
}
function buildIconPanel() {
  var ic = document.getElementById('icon-panel');
  if (ic) ic.innerHTML = ICON_LIB.map(function(e){ return '<button type="button" class="icon-opt" title="选 ' + e + '" onclick="pickIcon(\'' + e + '\')">' + e + '</button>'; }).join('');
}
function attachToolFormListeners() {
  document.querySelectorAll('#editModal input,#editModal select,#editModal textarea').forEach(function(el){
    el.addEventListener('input', tfRender);
  });
  var nameEl = document.getElementById('f-name');
  if (nameEl) nameEl.addEventListener('input', function(){
    if (tfMode === 'new' && !idTouched) { var s = slugify(nameEl.value); if (s) document.getElementById('f-id').value = s; }
  });
  var idEl = document.getElementById('f-id');
  if (idEl) idEl.addEventListener('input', function(){ idTouched = true; });
}

var tfId = null;      // 当前编辑的 id（新建为 null）
var tfMode = 'new';   // new | edit | fix | complete | migrate | register
var tfTool = null;    // 当前编辑的工具对象（buildManifest 保真 runtime 用）
var tfMissing = [];   // complete 模式：缺的字段

async function initToolForm() {
  await ensureToolSchema();
  renderToolFields();
}
var idTouched = false;

function slugify(name) {
  var s = name.toLowerCase().replace(/[一-鿿\s]+/g, '-').replace(/[^a-z0-9-_]/g, '').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return /^[a-z]/.test(s) ? s : ('tool-' + (s || '')).replace(/^tool-[-_]+/, 'tool-');
}

function setIdLocked(editing) {
  var idIn = document.getElementById('f-id'), idVal = document.getElementById('id-val'), idReq = document.getElementById('id-req');
  if (idIn) idIn.style.display = editing ? 'none' : 'block';
  if (idVal) idVal.style.display = editing ? 'block' : 'none';
  if (idReq) idReq.style.display = editing ? 'none' : 'inline';
}

async function openToolForm(id, mode) {
  await ensureToolSchema();
  renderToolFields();
  tfMode = mode || 'edit';
  tfId = id || null;
  idTouched = false;
  tfMissing = [];
  var isNew = (tfMode === 'new' || tfMode === 'register');
  var t = null;
  if (id) t = tools.find(function(x){ return x.id === id; });
  tfTool = t;

  document.getElementById('editTitle').textContent =
    tfMode === 'new' ? '新增工具' :
    tfMode === 'register' ? '注册为工具' :
    tfMode === 'fix' ? '修复 manifest' :
    tfMode === 'complete' ? '补全字段' :
    tfMode === 'migrate' ? '迁移路径' : '编辑工具';

  // 填表
  function setv(fid, v) { document.getElementById(fid).value = v == null ? '' : v; }
  setv('f-name', isNew ? '' : (t && t.name ? t.name : ''));
  setv('f-id', isNew ? '' : id);
  var ver = isNew ? '' : (t && (t.version || (t.runtime && t.runtime.version) || ''));
  document.getElementById('f-version').textContent = ver || '—';
  setv('f-icon', isNew ? '' : (t && t.icon || ''));
  setv('f-category', isNew ? '模型' : (t && t.category ? t.category : '模型'));
  var typeVal = isNew ? 'service' : (t && t.type ? t.type : 'service');
  document.getElementById('f-form').value = typeVal;
  setv('f-loc', isNew ? ((typeVal === 'api') ? '远程' : '本地') : ((t && (t.loc || getToolLoc(t))) || '本地'));

  var func = '', when = '', whennot = '', ret = '', extra = '';
  if (t && t.description) {
    var d = parseDesc(t.description);
    func = d.secs['用途'] || '';
    when = d.secs['何时用'] || '';
    whennot = d.secs['何时不用'] || '';
    ret = d.secs['返回'] || '';
    extra = d.extra;
  }
  setv('f-func', isNew ? '' : func);
  setv('f-when', isNew ? '' : when);
  setv('f-whennot', isNew ? '' : whennot);
  setv('f-ret', isNew ? '' : ret);
  setv('f-extra-note', isNew ? '' : extra);
  if (!isNew && t) {
    if (!func) func = t.capability || '';
    setv('f-func', func);
    if (t.capability && !func) setv('f-func', t.capability);
  }
  setv('f-cap', isNew ? '' : (t && (t.capability || '')));

  setv('f-port', isNew ? '' : ((t && t.ports && t.ports.length) ? t.ports[0] : (t && t.port)));
  setv('f-url', isNew ? '' : (t && t.url));
  setv('f-public-url', isNew ? '' : (t && t.publicUrl));
  setv('f-api', isNew ? '' : (t && t.apiBase));
  setv('f-start', isNew ? '' : (t && t.startCommand));
  setv('f-stop', isNew ? '' : (t && t.stopCommand));
  setv('f-path', isNew ? '' : (t && t.projectPath));
  setv('f-trigger', isNew ? '' : (t && t.trigger));
  setv('f-start-cli', isNew ? '' : (t && t.startCommand));
  setv('f-path-cli', isNew ? '' : (t && t.projectPath));
  setv('f-api-api', isNew ? '' : (t && t.apiBase));
  setv('f-keyname', isNew ? '' : (t && t.apiKeyName));
  setv('f-url-api', isNew ? '' : (t && t.url));
  setv('f-path-folder', isNew ? '' : (t && t.projectPath));
  setv('f-children', isNew ? '' : (t && t.children ? t.children.map(function(c){ return (c.icon||'') + (c.name||'') + ' —— ' + (c.trigger||''); }).join('\n') : ''));
  setv('f-runtime', !isNew && t && t.runtime && t.runtime.language ? t.runtime.language : 'node');
  setv('f-notes', isNew ? '' : (t && (t.agent_notes || '')));
  setv('f-conflicts', isNew ? '' : (t && t.conflicts ? t.conflicts.map(function(c){ return typeof c === 'string' ? c : (c.toolId || c.toolName || ''); }).join(',') : ''));
  document.getElementById('f-autostart').checked = !isNew && t && t.autoStart;
  document.getElementById('f-disabled').checked = !isNew && t && t.disabled;
  var _ackEl = document.getElementById('f-category-ack');
  if (_ackEl) _ackEl.checked = !isNew && t && t.categoryAck;

  // id 锁定：新建显示输入框，编辑/修复/迁移锁定为 auto-val
  setIdLocked(!isNew);
  var idVal = document.getElementById('id-val');
  if (idVal) idVal.textContent = id || '—';
  // 删除按钮：仅编辑已有 manifest 显示
  var delBtn = document.getElementById('delBtn');
  if (delBtn) delBtn.style.display = (isNew || tfMode === 'fix') ? 'none' : '';
  document.getElementById('editSub').textContent =
    isNew ? (tfMode === 'register' ? '将写入 tools/' + (id || '') + '/manifest.json' : '将创建 tools/{id}/ 目录') :
    '正在编辑 ' + id;

  tfMissing = (t && t.missingFields) ? t.missingFields : [];
  applyFormType();
  document.getElementById('editModal').style.display = 'flex';
  tfRender();
}

function parseDesc(desc) {
  var secs = {};
  var extra = '';
  if (!desc) return { secs: secs, extra: extra };
  var re = /【([^】]+)】/g, labels = [], m;
  while ((m = re.exec(desc))) labels.push({ idx: m.index, label: m[1] });
  if (!labels.length) return { secs: secs, extra: '' };
  for (var i = 0; i < labels.length; i++) {
    var start = labels[i].idx + labels[i].label.length + 2;
    var end = i + 1 < labels.length ? labels[i + 1].idx : desc.length;
    var val = desc.slice(start, end).replace(/^。/, '').replace(/。$/, '').trim();
    secs[labels[i].label] = val;
    if (['用途','何时用','何时不用','返回'].indexOf(labels[i].label) === -1) {
      extra += desc.slice(labels[i].idx, end);
    }
  }
  return { secs: secs, extra: extra };
}

function suggestType() {
  var cat = document.getElementById('f-category').value;
  var loc = document.getElementById('f-loc').value;
  var sug = tfCatSuggest[cat];
  if (cat === '模型' && loc === '远程') sug = 'api';
  if (sug) document.getElementById('f-form').value = sug;
  applyFormType();
}
function applyFormType() {
  var f = document.getElementById('f-form').value;
  var disabled = document.getElementById('f-disabled').checked;
  var seen = {};
  (tfFields || []).forEach(function(fd){
    if (!fd.cg || seen[fd.cg]) return;
    seen[fd.cg] = 1;
    var show = !fd.formTypes || fd.formTypes.indexOf(f) !== -1;
    var el = document.getElementById('cg-' + fd.cg);
    if (el) el.classList.toggle('show', show);
  });
  var autoRow = document.getElementById('autoStart-row');
  var showAuto = (f === 'service' && !disabled);
  if (autoRow) autoRow.style.display = showAuto ? '' : 'none';
  if (!showAuto) document.getElementById('f-autostart').checked = false;
  tfRender();
}
function typeOf() {
  var f = document.getElementById('f-form').value;
  function v(fid){ var el = document.getElementById(fid); return el ? el.value.trim() : ''; }
  return {
    loc: v('f-loc') || ((f === 'api') ? '远程' : '本地'),
    acc: (function(){
      if (f === 'cli' || f === 'group') return ['命令行'];
      if (f === 'folder') return ['文件夹'];
      if (f === 'api') return v('f-api-api') ? ['API 调用'] : ['网页界面'];
      var a = []; if (v('f-port') || v('f-url')) a.push('网页界面'); if (v('f-api')) a.push('API 调用');
      return a.length ? a : ['网页界面'];
    })()
  };
}
function tfRender() {
  var d = typeOf();
  var da = document.getElementById('f-dims-acc'); if (da) da.textContent = '接入形态：' + (d.acc.join(' / ') || '—');
  var missing = [];
  function v(fid){ var el = document.getElementById(fid); return el ? el.value.trim() : ''; }
  if (v('f-name').length < 1) missing.push('名字');
  if (v('f-func').length < 2) missing.push('功能一句话');
  if (!v('f-category')) missing.push('分类');
  if (!v('f-loc')) missing.push('运行位置');
  var f = document.getElementById('f-form').value;
  if (f === 'service' && (v('f-start') === '' || v('f-stop') === '')) missing.push('启动/停止命令');
  if (f === 'api' && v('f-api-api') === '') missing.push('API 地址');
  if (f === 'folder' && v('f-path-folder') === '') missing.push('项目路径');
  if (f === 'group' && v('f-children') === '') missing.push('子工具');
  tfMissing.forEach(function(mf){ if (missing.indexOf(mf) === -1) missing.push(mf); });

  // 实时 manifest JSON 预览（v3 右侧暗色面板）
  var out = document.getElementById('json-out');
  var hr = document.getElementById('hint-row');
  if (!out || !hr) return;
  try {
    var mf = buildManifest();
    var json = JSON.stringify(mf, null, 2);
    out.innerHTML = json
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, function(m, str, col){ return col ? '<span class="jk">' + str + '</span>:' : '<span class="js">' + str + '</span>'; });
    hr.innerHTML = missing.length
      ? '<span class="invalid">✗ 校验未过</span> — 缺：' + missing.join('、') + '。'
      : '<span class="valid">✓ 校验通过</span> — 可保存。';
  } catch(e) {
    out.textContent = '预览失败：' + e.message;
    hr.innerHTML = '<span class="invalid">✗ ' + e.message + '</span>';
  }
}

function buildManifest() {
  function v(fid){ var el = document.getElementById(fid); return el ? el.value.trim() : ''; }
  var f = document.getElementById('f-form').value;
  var mf = { name: v('f-name'), id: v('f-id'), category: v('f-category'), type: f };
  var locV = v('f-loc'); if (locV) mf.loc = locV;
  var ownerVal = (tfMode === 'new' || tfMode === 'register') ? '外部' : ((tfTool && tfTool.owner) || '外部');
  if (ownerVal) mf.owner = ownerVal;
  var ver = (document.getElementById('f-version').textContent || '').trim();
  if (ver && ver !== '—') mf.version = ver;
  var func = v('f-func');
  var parts = ['【用途】' + func];
  if (v('f-when')) parts.push('【何时用】' + v('f-when'));
  if (v('f-whennot')) parts.push('【何时不用】' + v('f-whennot'));
  var port = v('f-port');
  var retMap = { service: '调 ' + (v('f-api') || v('f-url') || (port ? ':' + port : '本地服务')), cli: '在 Claude Code 输入 /' + v('f-trigger'), api: '调 ' + v('f-api-api'), folder: '打开项目目录', group: '运行组编排' };
  if (v('f-ret')) parts.push('【返回】' + v('f-ret'));
  else parts.push('【返回】' + retMap[f]);
  var extra = v('f-extra-note');
  if (extra) parts.push(extra);
  mf.description = parts.join('。');
  mf.capability = v('f-cap') || func.slice(0, 30);
  if (v('f-icon')) mf.icon = v('f-icon');
  if (f === 'service') {
    if (v('f-port')) mf.port = Number(v('f-port'));
    if (v('f-url')) mf.url = v('f-url');
    if (v('f-public-url')) mf.publicUrl = v('f-public-url');
    if (v('f-api')) mf.apiBase = v('f-api');
    mf.startCommand = v('f-start') || undefined;
    mf.stopCommand = v('f-stop') || undefined;
    if (v('f-path')) mf.projectPath = v('f-path');
    if (v('f-runtime')) { var _rt = (tfTool && tfTool.runtime) || {}; mf.runtime = { language: v('f-runtime'), version: _rt.version || '', manager: _rt.manager || '', note: _rt.note || '' }; }
  } else if (f === 'cli') {
    if (v('f-trigger')) mf.trigger = v('f-trigger');
    if (v('f-start-cli')) mf.startCommand = v('f-start-cli');
    if (v('f-path-cli')) mf.projectPath = v('f-path-cli');
    if (v('f-runtime')) { var _rt = (tfTool && tfTool.runtime) || {}; mf.runtime = { language: v('f-runtime'), version: _rt.version || '', manager: _rt.manager || '', note: _rt.note || '' }; }
  } else if (f === 'api') {
    if (v('f-api-api')) mf.apiBase = v('f-api-api');
    if (v('f-keyname')) mf.apiKeyName = v('f-keyname');
    if (v('f-url-api')) mf.url = v('f-url-api');
  } else if (f === 'folder') {
    if (v('f-path-folder')) mf.projectPath = v('f-path-folder');
  } else if (f === 'group') {
    var cs = document.getElementById('f-children').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean).map(function(line){
      var m = line.match(/^(.*?)\s*——\s*(.*)$/);
      if (m) return { icon: m[1].trim().slice(0, 2), name: m[1].trim().replace(/^(\p{Extended_Pictographic})\s*/u, ''), trigger: m[2].trim() };
      return { name: line };
    });
    if (cs.length) mf.children = cs;
  }
  if (f === 'service' && document.getElementById('f-autostart').checked) mf.autoStart = true;
  if (document.getElementById('f-disabled').checked) mf.disabled = true;
  var _ackEl = document.getElementById('f-category-ack');
  if (_ackEl && _ackEl.checked) mf.categoryAck = true;
  if (v('f-notes')) mf.agent_notes = v('f-notes');
  var confs = v('f-conflicts').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if (confs.length) mf.conflicts = confs;
  Object.keys(mf).forEach(function(k){ if (mf[k] === undefined) delete mf[k]; });
  return mf;
}

async function submitToolForm() {
  var isNew = (tfMode === 'new' || tfMode === 'register');
  var mf = buildManifest();
  var id = mf.id;
  if (!isNew) id = tfId;
  if (!id) { setFormError('需要 id'); return; }
  mf.id = id;
  try {
    var res = await fetch(isNew ? '/api/tools' : '/api/tools/' + id, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mf)
    });
    var data = await res.json();
    if (!data.ok) {
      setFormError(data.error || '保存失败');
      return;
    }
    closeModal();
    fetchTools();
  } catch(e) {
    setFormError(e.message);
  }
}
function setFormError(msg) {
  var hr = document.getElementById('hint-row');
  if (hr) hr.innerHTML = '<span class="invalid">✗ ' + String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
}

function closeModal() {
  document.getElementById('editModal').style.display = 'none';
}
// 原型标记 onclick 调 saveTool/deleteTool，接到真实保存/删除
function saveTool() { submitToolForm(); }
function deleteTool() { confirmDeleteForm(); }
function closeLogModal() {
  document.getElementById('logModal').style.display = 'none';
}
function toggleIconPanel() {
  var p = document.getElementById('icon-panel');
  p.style.display = p.style.display === 'none' ? 'flex' : 'none';
}
function pickIcon(e) {
  document.getElementById('f-icon').value = e;
  document.getElementById('icon-panel').style.display = 'none';
  tfRender();
}
function confirmDelete(id) {
  var t = tools.find(function(x){ return x.id === id; });
  var label = t && t.name ? t.name : id;
  if (!window.confirm('确认删除工具「' + label + '」（id: ' + id + '）？\n将删除整个 tools/' + id + '/ 目录，不可恢复。')) return;
  doDelete(id);
}
function confirmDeleteForm() {
  if (!tfId) return;
  var t = tools.find(function(x){ return x.id === tfId; });
  var label = t && t.name ? t.name : tfId;
  if (!window.confirm('确认删除工具「' + label + '」（id: ' + tfId + '）？\n将删除整个 tools/' + tfId + '/ 目录，不可恢复。')) return;
  doDelete(tfId);
}
async function doDelete(id) {
  try {
    var res = await fetch('/api/tools/' + id + '?confirm=true', { method: 'DELETE' });
    var data = await res.json();
    closeModal();
    fetchTools();
    if (!data.ok) alert('删除失败：' + (data.error || '未知错误'));
  } catch(e) { alert('删除失败：' + e.message); }
}

async function viewLogs(id) {
  document.getElementById('logTitle').textContent = '启动失败日志 · ' + id;
  document.getElementById('logBody').textContent = '加载中…';
  document.getElementById('logModal').style.display = 'flex';
  try {
    var res = await fetch('/api/tools/' + id + '/start-failed');
    var data = await res.json();
    if (!data.ok || !data.record) {
      document.getElementById('logBody').textContent = '无启动失败记录（5 分钟内有效）。可尝试「重试启动」。';
      document.getElementById('logHint').textContent = '';
      return;
    }
    var r = data.record;
    var lines = [];
    lines.push('时间: ' + new Date(r.ts).toLocaleString());
    if (r.via) lines.push('方式: ' + r.via);
    if (r.error) lines.push('错误: ' + r.error);
    if (r.code != null) lines.push('退出码: ' + r.code);
    if (r.signal) lines.push('信号: ' + r.signal);
    if (r.elapsedMs != null) lines.push('耗时: ' + r.elapsedMs + 'ms');
    if (r.stderr) { lines.push(''); lines.push('── stderr（末 200 字）──'); lines.push(r.stderr); }
    document.getElementById('logBody').textContent = lines.join('\n') || '（空记录）';
    document.getElementById('logHint').textContent = '记录 5 分钟后失效';
  } catch(e) {
    document.getElementById('logBody').textContent = '读取失败：' + e.message;
  }
}
