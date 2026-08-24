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
var locFilter = 'all';    // 运行位置
var accFilter = 'all';    // 接入形态
var stateFilter = 'all';  // 状态
var appsData = null;
var tipsData = null;
var regData = null;
var tipF = 'all';
var regDoc = 'design';

// 领域映射：category → 领域（dim 块按此聚合）
var domainMap = {
  '模型': '模型', '本地模型': '模型', '远程模型': '模型',
  'Agent': 'Agent', '设施': '设施', '获取': '获取',
  '查阅': '查阅', '创作': '创作', '职能': '职能', '工作区': '职能', '公开站': '公开站'
};

// 分类显示名 + 悬停解释。key 匹配 manifest.json 里的 category 字段
var catMeta = {
  '模型':     {label:'模型',     tip:'本地+云端 AI 模型能力：视觉理解/语音合成/LLM API — 模型的调用入口'},
  '本地模型': {label:'本地模型', tip:'本地部署的 AI 模型：MiniCPM视觉/CosyVoice语音/ACE音乐 — 本机 GPU 驱动'},
  '远程模型': {label:'远程模型', tip:'云端 AI 模型 API：DeepSeek/GLM/GPT/Imagen — 按量调用的远程模型'},
  'Agent':    {label:'Agent',    tip:'自主 AI Agent：Claude Code/Hermes/Codex CLI/RAG — 能独立执行任务的智能体'},
  '设施':     {label:'设施',     tip:'透明基础设施：API网关/协议代理/定时调度/联邦巡检 — 管道自己跑，日常不碰'},
  '获取':     {label:'获取',     tip:'数据采集：网页抓取/社媒下载/OCR/云盘 — 从外部获取信息的工具'},
  '查阅':     {label:'查阅',     tip:'浏览发现：版式画廊/Skill目录/架构图/人物名录 — 浏览和发现'},
  '创作':     {label:'创作',     tip:'AIGC内容生产：图像/音乐/语音/视频/排版 — AI 驱动的数字内容创作'},
  '职能':     {label:'职能',     tip:'生活+效率：税务/社保/保障房/购物/截图 — 个人事务工具'},
  '工作区':   {label:'工作区',   tip:'文件夹入口：项目目录/产出目录 — 打开即用，无需启动'},
  '公开站':   {label:'公开站',   tip:'已部署到公网的项目站点：Vercel/EdgeOne/自有域名 — 对外可访问的线上成果'}
};

// ── 四维异色筛选块（词汇照原型，取值由真实 manifest 推导）──
var DIMS = [
  { key:'category', label:'功能分类', cls:'fn',     bg:'#74A63F', values:['模型','Agent','设施','获取','查阅','创作','职能'] },
  { key:'loc',      label:'运行位置', cls:'loc',    bg:'#E5ECA1', values:['本地','远程'] },
  { key:'acc',      label:'接入形态', cls:'acc',    bg:'#FFFFFF', values:['网页界面','命令行','API 调用','文件夹'] },
  { key:'state',    label:'状态',     cls:'status', bg:'#EEF4EF', values:['运行中','已停止','已停用','仅接入'] }
];

// 是否有本地进程（命令/端口/项目路径）→ 本地/远程 判定
function hasLocalProcess(t) {
  return !!(t.startCommand || t.stopCommand || (t.ports && t.ports.length > 0) || t.port || t.projectPath);
}
function getToolLoc(t) {
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
  var cur = key === 'category' ? domainFilter : key === 'loc' ? locFilter : key === 'acc' ? accFilter : stateFilter;
  return cur === val;
}
function dimCount(key, val) {
  var n = 0;
  tools.forEach(function(t){
    if (key === 'category') { if ((domainMap[t.category||'其他']||'职能') === val) n++; }
    else if (key === 'loc') { if (getToolLoc(t) === val) n++; }
    else if (key === 'acc') { if (getToolAcc(t) === val) n++; }
    else if (key === 'state') { if (stateLabelOf(classifyState(t), t) === val) n++; }
  });
  return n;
}
function buildDimBlocks() {
  var grid = document.getElementById('dimBlocks'); if (!grid) return;
  var html = '';
  DIMS.forEach(function(d){
    html += '<div class="dim-block dim-' + d.cls + '" style="--b:' + d.bg + '"><div class="dim-block-title">' + d.label + '<span class="dim-arr">></span></div><div class="dim-block-opts">';
    d.values.forEach(function(v){
      html += '<span class="dim-opt' + (isDimActive(d.key, v) ? ' active' : '') + '" onclick="setDimFilter(\'' + d.key + '\',\'' + v + '\')">' + v + '<span style="font-size:11px;opacity:.55;margin-left:5px;font-family:var(--font-code)">' + dimCount(d.key, v) + '</span></span>';
    });
    html += '</div></div>';
  });
  grid.innerHTML = html;
}
function setDimFilter(key, val) {
  if (key === 'category') domainFilter = (domainFilter === val ? 'all' : val);
  else if (key === 'loc') locFilter = (locFilter === val ? 'all' : val);
  else if (key === 'acc') accFilter = (accFilter === val ? 'all' : val);
  else stateFilter = (stateFilter === val ? 'all' : val);
  buildDimBlocks();
  render();
}
function resetDims() {
  domainFilter = 'all'; locFilter = 'all'; accFilter = 'all'; stateFilter = 'all';
  var s = document.getElementById('searchInput'); if (s) s.value = '';
  buildDimBlocks();
  render();
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
  el = document.getElementById('navTipsCnt'); if (el && tipsData) el.textContent = tipsData.length;
  el = document.getElementById('navRegCnt'); if (el) el.textContent = 2;
}

function render() {
  var grid = document.getElementById('toolGrid');
  if (!tools.length) {
    grid.innerHTML = '<div class="empty">还没有工具 —— Agent 会在 <code>~/.agentboard/tools/</code> 下写入注册文件，自动上架。</div>';
    return;
  }

  // Filter
  var sorted = tools.slice();
  if (domainFilter !== 'all') sorted = sorted.filter(function(t){return (domainMap[t.category||'其他']||'职能') === domainFilter;});
  if (locFilter !== 'all') sorted = sorted.filter(function(t){return getToolLoc(t) === locFilter;});
  if (accFilter !== 'all') sorted = sorted.filter(function(t){return getToolAcc(t) === accFilter;});
  if (stateFilter !== 'all') sorted = sorted.filter(function(t){return stateLabelOf(classifyState(t), t) === stateFilter;});
  var search = getSearchTerm();
  if (search) {
    sorted = sorted.filter(function(t){
      return t.name.toLowerCase().indexOf(search) !== -1 || t.id.toLowerCase().indexOf(search) !== -1 || (t.description||'').toLowerCase().indexOf(search) !== -1;
    });
  }

  // Sort: category group, then running first, then order
  var catOrder = {'模型':0, '本地模型':0, '远程模型':0, 'Agent':1, '设施':2, '获取':3, '查阅':4, '创作':5, '职能':6};
  var cardOrder = [];
  try { cardOrder = JSON.parse(localStorage.getItem('agentboard-card-order') || '[]'); } catch(_) {}
  if (!Array.isArray(cardOrder)) cardOrder = [];
  sorted.sort(function(a,b){
    var ai = cardOrder.indexOf(a.id);
    var bi = cardOrder.indexOf(b.id);
    // both in saved order: preserve user arrangement
    if (ai !== -1 && bi !== -1) return ai - bi;
    // one is new (not in saved order): push to end
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    // both new: fallback to category -> running -> order
    var ca = catOrder[a.category] != null ? catOrder[a.category] : 99;
    var cb = catOrder[b.category] != null ? catOrder[b.category] : 99;
    if (ca !== cb) return ca - cb;
    if (a.running && !b.running) return -1;
    if (!a.running && b.running) return 1;
    return (a.order||99) - (b.order||99);
  });

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

function renderCard(t) {
  var state = classifyState(t);
  var ico = t.icon || (t.name || t.id).trim().charAt(0);
  var extraClass = (t.disabled && state !== 'disabled') ? ' st-disabled' : '';
  return '<div class="tool-card st-' + state + extraClass + '" data-id="' + t.id + '">'
    + '<div class="card-top"><span class="card-ico">' + escHtml(ico) + '</span><div class="card-name">' + escHtml(t.name || t.id) + '</div></div>'
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
  var meta = STATE_META[state] || STATE_META.stopped;
  var ports = t.ports || (t.port ? [t.port] : []);
  var portHtml = ports.length ? escHtml(ports.join(' :')) : '—';
  var isGroup = t.type === 'group';
  var desc = t.description || '—';
  return '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">ID</span><span class="card-id">' + escHtml(t.id) + '</span></span>'
    + '<span class="cf"><span class="cf-l">端口</span><span class="card-port">' + portHtml + '</span>' + (isGroup ? statusDots(t) : '') + '</span>'
    + '<span class="cf"><span class="cf-l">状态</span><span class="st-dot ' + state + '"></span><span class="status-word ' + state + '">' + escHtml(meta.label) + '</span></span>'
    + '<span class="cf"><span class="cf-l">功能</span><span class="card-desc' + (t.description ? '' : ' placeholder') + '" title="' + escAttr(t.description || '') + '">' + escHtml(desc) + '</span></span>'
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
  btns.push('<button class="btn edit" onclick="event.stopPropagation();openToolForm(\'' + t.id + '\',\'edit\')">编辑</button>');

  var publicBtn = t.publicUrl ? '<a href="' + escAttr(t.publicUrl) + '" target="_blank" class="btn public" onclick="event.stopPropagation()" title="公开站: ' + escAttr(t.publicUrl) + '">公开站</a>' : '';
  var toggle = '<label class="toggle-sm" onclick="event.stopPropagation();toggleDisabled(\'' + t.id + '\')"><input type="checkbox"' + (t.disabled ? '' : ' checked') + '><span class="toggle-track' + (t.disabled ? '' : ' on') + '"></span><span class="toggle-label' + (t.disabled ? '' : ' on') + '">' + (t.disabled ? '停用' : '启用') + '</span></label>';

  return '<div class="card-actions">' + btns.join('') + publicBtn + '<span class="p4-spacer"></span>' + toggle + '</div>';
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
  if (!appsData.length) { grid.innerHTML = '<div class="empty">还没有网站 —— 壳阶段只读展示。</div>'; return; }
  grid.innerHTML = appsData.map(appCard).join('');
}
function appDomainOf(a) {
  return (a.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}
function appCard(a) {
  var ico = a.name ? a.name.trim().charAt(0) : '站';
  var desc = a.description || '—';
  return '<div class="tool-card">'
    + '<div class="card-top"><span class="card-ico">' + escHtml(ico) + '</span><div class="card-name">' + escHtml(a.name) + '</div></div>'
    + '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">域名</span><a class="card-domain" href="' + escAttr(a.url || '#') + '" target="_blank" title="' + escAttr(a.url || '') + '">' + escHtml(appDomainOf(a)) + ' ↗</a></span>'
    + '<span class="cf"><span class="cf-l">托管</span><span class="card-val">' + escHtml(a.host || '—') + '</span></span>'
    + '<span class="cf"><span class="cf-l">描述</span><span class="card-desc' + (a.description ? '' : ' placeholder') + '" title="' + escAttr(a.description || '') + '">' + escHtml(desc) + '</span></span>'
    + '</div>'
    + '<div class="card-actions">'
    + (a.url ? '<a class="btn open" href="' + escAttr(a.url) + '" target="_blank">打开</a>' : '')
    + '<button class="btn edit" onclick="toast(\'壳阶段：网站编辑下阶段接入\')">编辑</button>'
    + '<span class="p4-spacer"></span>'
    + '</div>'
    + '</div>';
}

/* ── 经验日志 ── */
var TIP_DEFS=[['all','全部'],['diagnosis','诊断'],['method','方法'],['fact','事实'],['capability','能力'],['feedback','反馈']];
var TIP_CHAR={'diagnosis':'诊','method':'方','fact':'事','capability':'能','feedback':'反'};
var TIP_GEO={'diagnosis':'<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>','method':'<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>','fact':'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4 L10.6 6 L6 10.6 L1.4 6 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>','capability':'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.6 6 H10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 1.6 V10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>','feedback':'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4 A4.6 4.6 0 0 1 6 10.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'};
var TIP_LABEL={'diagnosis':'诊断','method':'方法','fact':'事实','capability':'能力','feedback':'反馈'};

async function renderTips() {
  if (!tipsData) {
    try {
      var res = await fetch('/api/tips');
      var data = await res.json();
      if (!data.ok) { document.getElementById('tipGrid').innerHTML = '<div class="empty">日志加载失败</div>'; return; }
      tipsData = data.tips || [];
      updateCounts();
    } catch(e) { document.getElementById('tipGrid').innerHTML = '<div class="empty">日志加载失败</div>'; return; }
  }
  renderTipDims();
  var q = (document.getElementById('tipSearch') ? document.getElementById('tipSearch').value : '').trim().toLowerCase();
  var list = tipsData.filter(function(x){
    if (tipF !== 'all' && x.type !== tipF) return false;
    if (q && (x.title + ' ' + x.desc + ' ' + x.file).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  document.getElementById('tipGrid').innerHTML = list.length ? list.map(tipCard).join('') : '<div class="empty">没有匹配的日志</div>';
}
function renderTipDims() {
  var el = document.getElementById('tipDimBlocks'); if (!el) return;
  var counts = {};
  (tipsData || []).forEach(function(x){ counts[x.type] = (counts[x.type] || 0) + 1; });
  var html = '<div class="dim-block" style="--b:#EEF4EF"><div class="dim-block-title">类型<span class="dim-arr">></span></div><div class="dim-block-opts">';
  TIP_DEFS.forEach(function(d){
    var cnt = d[0] === 'all' ? (tipsData || []).length : (counts[d[0]] || 0);
    html += '<span class="dim-opt' + (tipF === d[0] ? ' active' : '') + '" onclick="setTipF(\'' + d[0] + '\')">' + d[1] + '<span style="font-size:11px;opacity:.55;margin-left:5px;font-family:var(--font-code)">' + cnt + '</span></span>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}
function setTipF(f) { tipF = f; renderTips(); }
function tipCard(x) {
  var t = TIP_LABEL[x.type] || '日志';
  return '<div class="tool-card tip-card">'
    + '<div class="card-top"><span class="card-ico">' + (TIP_CHAR[x.type] || '记') + '</span><div class="card-name">' + escHtml(x.title) + '</div></div>'
    + '<div class="card-meta-row">'
    + '<span class="cf"><span class="cf-l">类型</span><span class="tip-type">' + (TIP_GEO[x.type] || '') + escHtml(t) + '</span></span>'
    + '<span class="cf"><span class="cf-l">文件</span><span class="card-id">' + escHtml(x.file) + '</span></span>'
    + '<span class="cf top"><span class="cf-l">内容</span><span class="tip-desc-cell">' + escHtml(x.desc || '—') + '</span></span>'
    + '</div>'
    + '<div class="card-actions"><button class="btn edit" onclick="toast(\'壳阶段：日志编辑下阶段接入\')">编辑</button><span class="p4-spacer"></span></div>'
    + '</div>';
}

/* ── 系统规范：设计规范 + 工程规范 ── */
var REG_DEFS=[['design','设计规范'],['repo','工程规范']];
async function renderRegView() {
  if (!regData) {
    try {
      var res = await fetch('/api/registry');
      var data = await res.json();
      if (!data.ok) { document.getElementById('regView').innerHTML = '<div class="empty">规范文档加载失败</div>'; return; }
      regData = data.docs || [];
    } catch(e) { document.getElementById('regView').innerHTML = '<div class="empty">规范文档加载失败</div>'; return; }
  }
  renderRegDims();
  var el = document.getElementById('regView'); if (!el) return;
  var doc = null;
  regData.forEach(function(x){ if (x.key === regDoc) doc = x; });
  el.innerHTML = doc ? md2html(doc.markdown || '') : '<div class="empty">文档缺失：' + escHtml(regDoc) + '</div>';
}
function renderRegDims() {
  var el = document.getElementById('regDimBlocks'); if (!el) return;
  var html = '<div class="dim-block" style="--b:#EEF4EF"><div class="dim-block-title">文档<span class="dim-arr">></span></div><div class="dim-block-opts">';
  REG_DEFS.forEach(function(d){
    html += '<span class="dim-opt' + (regDoc === d[0] ? ' active' : '') + '" onclick="setRegDoc(\'' + d[0] + '\')">' + d[1] + '</span>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}
function setRegDoc(d) { regDoc = d; renderRegView(); }

function mdInline(s){
  s = escHtml(s);
  s = s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
  s = s.replace(/\*([^*]+)\*/g,'<i>$1</i>');
  return s;
}
function mdTableRow(l,tag){
  var cells = l.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|');
  var h = '';
  cells.forEach(function(c){
    c = c.trim();
    h += (tag==='th'?'<th>':'<td>') + mdInline(c) + (tag==='th'?'</th>':'</td>');
  });
  return '<tr>'+h+'</tr>';
}
function md2html(src){
  var lines = src.split('\n');
  var out = [], inCode = false, codeBuf = [], listBuf = [];
  function flushList(){
    if (listBuf.length){ out.push('<ul>'+listBuf.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul>'); listBuf = []; }
  }
  for (var i = 0; i < lines.length; i++){
    var L = lines[i];
    if (inCode){
      if (/^```/.test(L)){ out.push('<pre><code>'+codeBuf.join('\n')+'</code></pre>'); inCode = false; codeBuf = []; }
      else codeBuf.push(escHtml(L));
      continue;
    }
    if (/^```/.test(L)){ flushList(); inCode = true; codeBuf = []; continue; }
    var m;
    if (m = L.match(/^\s*(#{1,6})\s+(.*)$/)){ flushList(); var n = m[1].length; out.push('<h'+n+'>'+mdInline(m[2])+'</h'+n+'>'); continue; }
    if (/^\s*[-*]\s+/.test(L)){ var li = L.replace(/^\s*[-*]\s+/,''); listBuf.push(mdInline(li)); continue; }
    if (/^\s*>\s?/.test(L)){ flushList(); out.push('<blockquote>'+mdInline(L.replace(/^\s*>\s?/,''))+'</blockquote>'); continue; }
    if (/^\s*\|/.test(L)){
      flushList();
      var rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])){ rows.push(lines[i]); i++; }
      i--;
      if (rows.length){
        var tbl = '<table><thead>'+mdTableRow(rows[0],'th')+'</thead><tbody>';
        for (var r = 1; r < rows.length; r++){
          if (/^\s*\|?[\s:|-]+\|?\s*$/.test(rows[r].replace(/[^|\s:-]/g,''))) continue;
          tbl += mdTableRow(rows[r],'td');
        }
        tbl += '</tbody></table>';
        out.push(tbl);
      }
      continue;
    }
    if (/^\s*-{3,}\s*$/.test(L)){ flushList(); out.push('<hr>'); continue; }
    if (/^\s*$/.test(L)){ flushList(); continue; }
    flushList();
    out.push('<p>'+mdInline(L)+'</p>');
  }
  flushList();
  if (inCode) out.push('<pre><code>'+codeBuf.join('\n')+'</code></pre>');
  return out.join('');
}

/* ── 网格参考层：8/32/128 三层，颜色深浅+线宽区分，选层制，左上角为零线 ── */
var gridOn = true, gridLayers = {128:true, 32:true, 8:true};
var GRID_TIERS = [[128,'rgba(51,51,51,1)',1],[32,'rgba(51,51,51,0.45)',1],[8,'rgba(51,51,51,0.2)',1]];
function gridStyle(){
  var o = document.getElementById('gridOverlay'); if (!o) return;
  var imgs = [], szs = [];
  if (gridOn){
    GRID_TIERS.forEach(function(t){
      if (!gridLayers[t[0]]) return;
      imgs.push('linear-gradient(' + t[1] + ' ' + t[2] + 'px,transparent ' + t[2] + 'px)');
      imgs.push('linear-gradient(90deg,' + t[1] + ' ' + t[2] + 'px,transparent ' + t[2] + 'px)');
      szs.push(t[0] + 'px ' + t[0] + 'px');
      szs.push(t[0] + 'px ' + t[0] + 'px');
    });
  }
  o.style.backgroundImage = imgs.length ? imgs.join(',') : 'none';
  o.style.backgroundSize = szs.length ? szs.join(',') : 'auto';
}
function setGridOn(v){
  gridOn = !!v;
  var b = document.querySelector('.g-toggle');
  if (b){
    b.classList.toggle('active', gridOn);
    var t = b.querySelector('.g-toggle-txt'); if (t) t.textContent = gridOn ? '开' : '关';
  }
  gridStyle();
}
function toggleLayer(v){
  gridLayers[v] = !gridLayers[v];
  document.querySelectorAll('.g-layer').forEach(function(b){
    if (+b.getAttribute('data-v') === v) b.classList.toggle('active', gridLayers[v]);
  });
  gridStyle();
}

/* ── 导航 ── */
function showPage(p){
  document.querySelectorAll('.page').forEach(function(s){ s.classList.remove('show'); });
  var pg = document.getElementById('page-' + p); if (pg) pg.classList.add('show');
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-page') === p); });
}

/* ── 初始化 ── */
document.addEventListener('DOMContentLoaded', function() {
  initToolForm();
  markOpened('dashboard');
  fetchTools();
  renderApps();
  renderTips();
  renderRegView();
  fetchCronState();
  gridStyle();
});

// ══ S5 人写面板：工具表单弹窗（新建/编辑/补全/迁移/修复/注册 一套）══

var CATEGORY_LIST = ['本地模型','远程模型','Agent','设施','获取','查阅','创作','职能','工作区','公开站'];
var OWNER_LIST = ['自建','外部','AI托管'];
var TYPE_LIST = [
  { v:'service', l:'服务 — 常驻后台' },
  { v:'cli',     l:'命令 — 用完就走' },
  { v:'api',     l:'API — 外部服务' },
  { v:'folder',  l:'文件夹 — 项目目录' },
  { v:'group',   l:'组 — 多工具编排' }
];
var RUNTIME_LIST = ['node','python','go','cpp','csharp','shell','other'];
var CAT_SUGGEST = {'本地模型':'service','远程模型':'api','Agent':'service','创作':'service','获取':'api','职能':'cli','设施':'service','查阅':'service','工作区':'folder','公开站':'folder'};
var ICON_LIB = ['🤖','🧠','🦙','🐱','🦞','🐙','💭','☁️','🆓','🎨','🎬','🎞️','🎵','🎙','🖌','📸','🎯','🔍','📥','🕸️','📡','🦐','📋','🔗','📌','📚','📕','📄','🗣','💬','📝','⚙','🏭','🐋','🛡','▲','◈','⬡','◎','↔️','🔀','⏰','🏠','🏪','🌐','🖼','🟢','🪽','👁','🎛','🧩','⭐','🔥','✨','📱','🗓','🔊'];

var tfId = null;      // 当前编辑的 id（新建为 null）
var tfMode = 'new';   // new | edit | fix | complete | migrate | register
var tfMissing = [];   // complete 模式：缺的字段

function initToolForm() {
  var catSel = document.getElementById('f-category');
  CATEGORY_LIST.forEach(function(c){ var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  var ownSel = document.getElementById('f-owner');
  OWNER_LIST.forEach(function(o){ var op = document.createElement('option'); op.value = o; op.textContent = o; ownSel.appendChild(op); });
  var formSel = document.getElementById('f-form');
  TYPE_LIST.forEach(function(t){ var op = document.createElement('option'); op.value = t.v; op.textContent = t.l; formSel.appendChild(op); });
  var rtSel = document.getElementById('f-runtime');
  RUNTIME_LIST.forEach(function(r){ var op = document.createElement('option'); op.value = r; op.textContent = r; rtSel.appendChild(op); });
  var icPanel = document.getElementById('icon-panel');
  icPanel.innerHTML = ICON_LIB.map(function(e){ return '<button type="button" class="icon-opt" title="选 '+e+'" onclick="pickIcon(\''+e+'\')">'+e+'</button>'; }).join('');
  document.querySelectorAll('#toolFormModal input,#toolFormModal select,#toolFormModal textarea').forEach(function(el){
    el.addEventListener('input', tfRender);
  });
  document.getElementById('f-name').addEventListener('input', function(){
    if (tfMode === 'new' && !idTouched) { var s = slugify(document.getElementById('f-name').value); if (s) document.getElementById('f-id').value = s; }
  });
  document.getElementById('f-id').addEventListener('input', function(){ idTouched = true; });
}
var idTouched = false;

function slugify(name) {
  var s = name.toLowerCase().replace(/[一-鿿\s]+/g, '-').replace(/[^a-z0-9-_]/g, '').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return /^[a-z]/.test(s) ? s : ('tool-' + (s || '')).replace(/^tool-[-_]+/, 'tool-');
}

function setModeBtn(m) {
  var edit = m === 'edit';
  var e = document.getElementById('mb-edit'), n = document.getElementById('mb-new');
  if (!e || !n) return;
  e.classList.toggle('active', edit);
  n.classList.toggle('active', !edit);
  document.getElementById('f-id').style.display = edit ? 'none' : 'block';
  document.getElementById('id-val').style.display = edit ? 'block' : 'none';
  document.getElementById('id-req').style.display = edit ? 'none' : 'inline';
}

function setMode(m) {
  var isNew = m === 'new';
  tfMode = isNew ? 'new' : 'edit';
  setModeBtn(m);
  document.getElementById('tfTitle').textContent = isNew ? '新建工具' : '编辑工具';
  document.getElementById('tfSub').textContent = isNew ? '将创建 tools/{id}/ 目录' : (tfId ? '正在编辑 ' + tfId : '');
  if (isNew && !idTouched) { var s = slugify(document.getElementById('f-name').value); if (s) document.getElementById('f-id').value = s; }
  applyFormType();
  tfRender();
}

function openToolForm(id, mode) {
  tfMode = mode || 'edit';
  tfId = id || null;
  idTouched = false;
  tfMissing = [];
  var isNew = (tfMode === 'new' || tfMode === 'register');
  var t = null;
  if (id) t = tools.find(function(x){ return x.id === id; });

  document.getElementById('tfTitle').textContent =
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
  setv('f-category', isNew ? '本地模型' : (t && t.category ? t.category : '本地模型'));
  setv('f-owner', isNew ? '外部' : (t && t.owner ? t.owner : '外部'));
  var typeVal = isNew ? 'service' : (t && t.type ? t.type : 'service');
  document.getElementById('f-form').value = typeVal;

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
  setv('f-extra', extra);
  if (!isNew && t) {
    if (!func) func = t.capability || '';
    setv('f-func', func);
    if (t.capability && !func) setv('f-func', t.capability);
  }

  setv('f-port', isNew ? '' : ((t && t.ports && t.ports.length) ? t.ports[0] : (t && t.port)));
  setv('f-url', isNew ? '' : (t && t.url));
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

  // id 锁定：新建显示输入框，编辑/修复/迁移锁定为 auto-val
  setModeBtn(isNew ? 'new' : 'edit');
  // 删除按钮：仅编辑已有 manifest 显示
  document.getElementById('tfDelete').style.display = (isNew || tfMode === 'fix') ? 'none' : '';
  document.getElementById('tfSub').textContent =
    isNew ? (tfMode === 'register' ? '将写入 tools/' + (id || '') + '/manifest.json' : '将创建 tools/{id}/ 目录') :
    '正在编辑 ' + id;

  tfMissing = (t && t.missingFields) ? t.missingFields : [];
  applyFormType();
  document.getElementById('toolFormModal').style.display = 'flex';
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
  if (CAT_SUGGEST[cat]) document.getElementById('f-form').value = CAT_SUGGEST[cat];
  applyFormType();
}
function applyFormType() {
  var f = document.getElementById('f-form').value;
  var disabled = document.getElementById('f-disabled').checked;
  ['service','cli','api','folder','group'].forEach(function(id){
    document.getElementById('cg-' + id).classList.toggle('show', id === f);
  });
  var hasOps = (f === 'service' || f === 'cli');
  document.getElementById('ops-path').classList.toggle('show', hasOps);
  document.getElementById('ops-none').classList.toggle('show', (f === 'api' || f === 'group'));
  var autoField = document.getElementById('autoStart-field');
  var showAuto = (f === 'service' && !disabled);
  autoField.style.display = showAuto ? '' : 'none';
  if (!showAuto) document.getElementById('f-autostart').checked = false;
  tfRender();
}
function tfRender() {
  var missing = [];
  function v(fid){ var el = document.getElementById(fid); return el ? el.value.trim() : ''; }
  if (v('f-name').length < 1) missing.push('名字');
  if (v('f-func').length < 2) missing.push('功能一句话');
  if (!v('f-category')) missing.push('分类');
  if (!v('f-owner')) missing.push('归属');
  var f = document.getElementById('f-form').value;
  if (f === 'service' && (v('f-start') === '' || v('f-stop') === '')) missing.push('启动/停止命令');
  if (f === 'cli' && v('f-trigger') === '') missing.push('触发词');
  if (f === 'api' && v('f-api-api') === '') missing.push('API 地址');
  if (f === 'folder' && v('f-path-folder') === '') missing.push('项目路径');
  if (f === 'group' && v('f-children') === '') missing.push('子工具');
  tfMissing.forEach(function(mf){ if (missing.indexOf(mf) === -1) missing.push(mf); });
  var hint = document.getElementById('tfHint');
  if (hint) {
    if (missing.length) { hint.textContent = '✗ 缺：' + missing.join('、'); hint.className = 'hint err'; }
    else { hint.textContent = '✓ 校验通过 — 保存将写入 manifest.json'; hint.className = 'hint'; }
  }

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
  function v(fid){ return document.getElementById(fid).value.trim(); }
  var f = document.getElementById('f-form').value;
  var mf = { name: v('f-name'), id: v('f-id'), category: v('f-category'), owner: v('f-owner'), type: f };
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
  var extra = document.getElementById('f-extra').value;
  if (extra) parts.push(extra);
  mf.description = parts.join('。');
  mf.capability = func.slice(0, 30);
  if (v('f-icon')) mf.icon = v('f-icon');
  if (f === 'service') {
    if (v('f-port')) mf.port = Number(v('f-port'));
    if (v('f-url')) mf.url = v('f-url');
    if (v('f-api')) mf.apiBase = v('f-api');
    mf.startCommand = v('f-start') || undefined;
    mf.stopCommand = v('f-stop') || undefined;
    if (v('f-path')) mf.projectPath = v('f-path');
    if (v('f-runtime')) mf.runtime = { language: v('f-runtime'), version: '', manager: '', note: '' };
  } else if (f === 'cli') {
    if (v('f-trigger')) mf.trigger = v('f-trigger');
    if (v('f-start-cli')) mf.startCommand = v('f-start-cli');
    if (v('f-path-cli')) mf.projectPath = v('f-path-cli');
    if (v('f-runtime')) mf.runtime = { language: v('f-runtime'), version: '', manager: '', note: '' };
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
  if (!id) { document.getElementById('tfHint').textContent = '✗ 需要 id'; document.getElementById('tfHint').className = 'hint err'; return; }
  mf.id = id;
  try {
    var res = await fetch(isNew ? '/api/tools' : '/api/tools/' + id, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mf)
    });
    var data = await res.json();
    if (!data.ok) {
      document.getElementById('tfHint').textContent = '✗ ' + (data.error || '保存失败');
      document.getElementById('tfHint').className = 'hint err';
      return;
    }
    closeToolForm();
    fetchTools();
  } catch(e) {
    document.getElementById('tfHint').textContent = '✗ ' + e.message;
    document.getElementById('tfHint').className = 'hint err';
  }
}

function closeToolForm() {
  document.getElementById('toolFormModal').style.display = 'none';
}
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
function clearIcon() { document.getElementById('f-icon').value = ''; tfRender(); }

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
    closeToolForm();
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
