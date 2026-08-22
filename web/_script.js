
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
var filter = 'all';
var domainFilter = 'all';
var formFilter = 'all';
var ownerFilter = 'all';
var publicFilter = false;
	var disabledFilter = false;

// 领域映射：category → 领域（用于筛选栏分组）
var domainMap = {
  '模型': '模型',
  '本地模型': '模型',
  '远程模型': '模型',
  'Agent': 'Agent',
  '设施': '设施',
  '获取': '获取',
  '查阅': '查阅',
  '创作': '创作',
  '职能': '职能',
  '工作区': '职能',
  '公开站': '公开站'
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

function setFilter(f) {
  if (filter === f && f !== 'all') { filter = 'all'; }
  else { filter = f; }
  publicFilter = false; syncPublicUI();
  document.querySelectorAll('.stat-card').forEach(function(c){ c.classList.remove('active'); });
  var card = document.querySelector('.stat-card[data-filter="' + filter + '"]');
  if (card) card.classList.add('active');
  render();
}

function setDomainFilter(d) {
  domainFilter = (domainFilter === d) ? 'all' : d;
  document.querySelectorAll('.filter-pill[data-domain]').forEach(function(p){ p.classList.remove('active'); });
  var pill = document.querySelector('.filter-pill[data-domain="' + domainFilter + '"]');
  if (pill) pill.classList.add('active');
  render();
}

function setFormFilter(f) {
  formFilter = (formFilter === f) ? 'all' : f;
  document.querySelectorAll('.filter-pill[data-form]').forEach(function(p){ p.classList.remove('active'); });
  var pill = document.querySelector('.filter-pill[data-form="' + formFilter + '"]');
  if (pill) pill.classList.add('active');
  render();
}

function setOwnerFilter(o) {
  ownerFilter = (ownerFilter === o) ? 'all' : o;
  document.querySelectorAll('.filter-pill[data-owner]').forEach(function(p){ p.classList.remove('active'); });
  var pill = document.querySelector('.filter-pill[data-owner="' + ownerFilter + '"]');
  if (pill) pill.classList.add('active');
  render();
}

function setPublicFilter(v) {
  publicFilter = !publicFilter;
  syncPublicUI();
  render();
}

function setDisabledFilter() {
	  disabledFilter = !disabledFilter;
	  document.querySelectorAll('.filter-pill[data-disabled]').forEach(function(p){ p.classList.remove('active'); });
	  if (disabledFilter) {
	    var pill = document.querySelector('.filter-pill[data-disabled]');
	    if (pill) pill.classList.add('active');
	    document.querySelectorAll('.stat-card').forEach(function(c){ c.classList.remove('active'); });
	  } else {
	    var allStat = document.querySelector('.stat-card[data-filter="all"]');
	    if (allStat) allStat.classList.add('active');
	  }
	  render();
	}

	function setPublicStatFilter() {
  publicFilter = !publicFilter;
  syncPublicUI();
  // 清除其他 stat card 的 active 状态
  document.querySelectorAll('.stat-card').forEach(function(c){ c.classList.remove('active'); });
  if (publicFilter) {
    var stat = document.getElementById('publicStat');
    if (stat) stat.classList.add('active');
  } else {
    var allStat = document.querySelector('.stat-card[data-filter="all"]');
    if (allStat) allStat.classList.add('active');
  }
  render();
}

function syncPublicUI() {
  document.querySelectorAll('.filter-pill[data-public]').forEach(function(p){ p.classList.remove('active'); });
  if (publicFilter) {
    var pill = document.querySelector('.filter-pill[data-public]');
    if (pill) pill.classList.add('active');
  }
}

function getSearchTerm() {
  var inp = document.getElementById('searchInput');
  return (inp && inp.value || '').trim().toLowerCase();
}

function isVirtual(t) {
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  return !hasPorts && !t.startCommand && !t.stopCommand;
}

// 形态检测（v3 标签）：Web 本地服务 / 命令 CLI / API 远程 / 文件夹 / 组
function getToolForm(t) {
  if (t.type === 'cli' || t.type === 'command') return '命令';
  if (t.type === 'folder') return '文件夹';
  if (t.type === 'group') return '组';
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  var hasCommands = t.startCommand || t.stopCommand;
  var hasApi = t.apiBase;
  if (hasPorts) return 'Web';
  if (hasCommands && !hasPorts && !hasApi) return '命令';
  if (hasApi) return 'API';
  if (t.url && !hasPorts && !hasCommands) return 'Web';
  return 'API';
}

// 归属检测：自建/外部
function getToolOwner(t) {
  if (t.owner) return t.owner;
  if (t.startCommand || t.stopCommand) return '自建';
  return '外部';
}

// Pre-populated by server; apply immediately if available
(function() {
  if (window.__stats) {
    var s = window.__stats;
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('callToday', s.todayCalls);
    set('callAgent', s.byCaller.agent);
    set('callBrowser', s.byCaller.browser);
    set('callList', s.byAction.list);
    set('callControl', s.byAction.control);
    if (s.assets) {
      var setT = function(id, label, count) { var el = document.getElementById(id); if (el) el.title = label + ' · ' + count; };
      setT('assetRegistry', '自启动 + 设计规范 + 工程规范', '1 页');
      setT('assetTips', '操作日志', s.assets.tips + ' 条');
      setT('assetApi', 'API 文档', s.assets.api + ' 个端点');

    }
  }
})();

async function fetchStats() {
  try {
    var res = await fetch('/api/stats');
    var data = await res.json();
    if (data.ok) {
      document.getElementById('callToday').textContent = data.todayCalls;
      document.getElementById('callAgent').textContent = (data.byCaller.today.agent || 0);
      document.getElementById('callBrowser').textContent = (data.byCaller.today.browser || 0);
      document.getElementById('callList').textContent = (data.byAction.today.list || 0);
      document.getElementById('callControl').textContent = (data.byAction.today.control || 0);
    }
  } catch(e) {
    console.error('fetchStats:', e);
  }
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
  var btn = document.getElementById('refreshBtn');
  btn.classList.add('spin');
  try {
    var res = await fetch('/api/tools');
    var data = await res.json();
    if (data.ok) {
      tools = data.tools;
      updatePillCounts();
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
      render();
    }
  } catch(e) {
    document.getElementById('totalCount').textContent = '—';
    document.getElementById('openableCount').textContent = '—';
    document.getElementById('openedCount').textContent = '—';
    document.getElementById('stoppedCount').textContent = '—';
  }
  btn.classList.remove('spin');
  fetchStats();
  fetchCronState();
}

function getFilterDesc() {
  var parts = [];
  if (domainFilter !== 'all') parts.push(domainFilter);
  if (formFilter !== 'all') parts.push(formFilter);
  if (ownerFilter !== 'all') parts.push(ownerFilter === '自建' ? '自建工具' : '外部');
  if (publicFilter) parts.push('已部署公开站');
  return parts.length ? parts.join(' · ') : '全部工具';
}

function resetAllFilters() {
  filter = 'all'; domainFilter = 'all'; formFilter = 'all'; ownerFilter = 'all'; publicFilter = false;
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.stat-card').forEach(function(c){ c.classList.remove('active'); });
  var allStat = document.querySelector('.stat-card[data-filter="all"]');
  if (allStat) allStat.classList.add('active');
  document.querySelectorAll('.filter-pill[data-domain],.filter-pill[data-form],.filter-pill[data-owner],.filter-pill[data-public]').forEach(function(p){ p.classList.remove('active'); });
  render();
}

function updatePillCounts() {
  var domainCounts = {};
  var formCounts = {};
  var ownerCounts = {};
  tools.forEach(function(t) {
    var c = domainMap[t.category||'其他'] || '职能'; domainCounts[c] = (domainCounts[c] || 0) + 1;
    var f = getToolForm(t); formCounts[f] = (formCounts[f] || 0) + 1;
    var o = getToolOwner(t); ownerCounts[o] = (ownerCounts[o] || 0) + 1;
  });
  ['模型','Agent','设施','获取','查阅','创作','职能'].forEach(function(c) {
    var pill = document.querySelector('.filter-pill[data-domain="' + c + '"] .pill-cnt');
    if (pill) pill.textContent = domainCounts[c] || 0;
  });
  ['本地','API','CLI','Web','命令'].forEach(function(f) {
    var pill = document.querySelector('.filter-pill[data-form="' + f + '"] .pill-cnt');
    if (pill) pill.textContent = formCounts[f] || 0;
  });
  ['自建','外部','AI托管'].forEach(function(o) {
    var pill = document.querySelector('.filter-pill[data-owner="' + o + '"] .pill-cnt');
    if (pill) pill.textContent = ownerCounts[o] || 0;
  });
  var publicCnt = tools.filter(function(t){ return t.publicUrl; }).length;
  var publicPill = document.querySelector('.filter-pill[data-public] .pill-cnt');
  if (publicPill) publicPill.textContent = publicCnt;

  var disabledCnt = tools.filter(function(t){ return t.disabled; }).length;
  var disabledPill = document.getElementById('disabledCount');
  if (disabledPill) disabledPill.textContent = disabledCnt;

  // 维度合计（标签后跟总数 + ✓/⚠）
  var total = tools.length;
  function setDimSum(countId, okId, sum) {
    var elC = document.getElementById(countId);
    var elO = document.getElementById(okId);
    if (elC) elC.textContent = sum;
    if (elO) {
      if (sum === total) { elO.textContent = '✓'; elO.className = 'dim-ok'; }
      else { elO.textContent = '⚠缺' + (total - sum); elO.className = 'dim-warn'; }
    }
  }
  setDimSum('domainCount', 'domainOk', Object.values(domainCounts).reduce(function(a,b){return a+b;}, 0));
  setDimSum('formCount', 'formOk', Object.values(formCounts).reduce(function(a,b){return a+b;}, 0));
  setDimSum('ownerCount', 'ownerOk', Object.values(ownerCounts).reduce(function(a,b){return a+b;}, 0));
}

function render() {
  var grid = document.getElementById('toolGrid');
  if (!tools.length) {
    grid.innerHTML = '<div class="empty"><p>还没有工具</p><p>Agent 会在 <code>~/.agentboard/tools/</code> 下写入注册文件，自动上架。</p></div>';
    document.getElementById('filterCount').innerHTML = '';
    return;
  }

  // Filter
  var sorted = tools.slice();
  if (filter === 'openable') sorted = sorted.filter(function(t){return (t.running || isVirtual(t)) && !opened[t.id] && t.url;});
  if (filter === 'opened') sorted = sorted.filter(function(t){return (t.running || isVirtual(t)) && opened[t.id] && t.url;});
  if (filter === 'stopped') sorted = sorted.filter(function(t){return t.running === false;});
  if (domainFilter !== 'all') sorted = sorted.filter(function(t){return (domainMap[t.category||'其他']||'职能') === domainFilter;});
  if (formFilter !== 'all') sorted = sorted.filter(function(t){return getToolForm(t) === formFilter;});
  if (ownerFilter !== 'all') sorted = sorted.filter(function(t){return getToolOwner(t) === ownerFilter;});
  if (publicFilter) sorted = sorted.filter(function(t){return t.publicUrl;});
	  if (disabledFilter) sorted = sorted.filter(function(t){return t.disabled;});
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

  // Update filter count
  var countEl = document.getElementById('filterCount');
  if (countEl) {
    var desc = getFilterDesc();
    var isFiltered = domainFilter !== 'all' || formFilter !== 'all' || ownerFilter !== 'all' || search;
    if (isFiltered) {
      countEl.innerHTML = desc + ' — <strong>' + sorted.length + '</strong> / ' + tools.length + ' 个工具';
    } else {
      countEl.innerHTML = desc + ' — <strong>' + sorted.length + '</strong> 个工具';
    }
  }

  if (!sorted.length) {
    grid.innerHTML = '<div class="empty"><p style="font-size:28px;margin-bottom:4px">(╯°□°)╯</p><p>没有工具匹配当前筛选组合</p><p style="font-size:12px;margin-top:6px">' + getFilterDesc() + '</p><a class="reset-link" onclick="resetAllFilters()" title="清除所有领域/形态/归属/部署/状态筛选条件，恢复显示全部工具">← 重置全部筛选</a></div>';
    return;
  }

  grid.innerHTML = sorted.map(function(t){ return renderCard(t); }).join('');
}

// ── 卡片组件：固定 5 槽位 P0-P4（S4）──
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
  var v = isVirtual(t);
  var isCli = t.type === 'cli' || t.type === 'command';
  var isGroup = t.type === 'group';

  var extraClass = '';
  if (v) extraClass += ' virtual';
  if (t.disabled && state !== 'disabled') extraClass += ' st-disabled';

  return '<div class="tool-card st-' + state + extraClass + '" data-id="' + t.id + '">'
    + cardTopHtml(t, state)
    + metaRowHtml(t, state, isCli, isGroup)
    + descHtml(t)
    + actionsHtml(t, state, isCli)
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

function cardTopHtml(t, state) {
  var abnormal = state === 'broken' || state === 'incomplete' || state === 'orphan';
  var badges;
  if (abnormal) {
    badges = '<div class="card-badges"><span class="badge badge-cat" style="opacity:.4">—</span></div>';
  } else {
    var b = [];
    if (t.category) b.push('<span class="badge badge-cat" title="' + escAttr(catMeta[t.category] ? catMeta[t.category].tip : '') + '">' + escHtml(t.category) + '</span>');
    b.push('<span class="badge badge-form">' + escHtml(getToolForm(t)) + '</span>');
    b.push('<span class="badge badge-owner">' + escHtml(getToolOwner(t)) + '</span>');
    badges = '<div class="card-badges">' + b.join('') + '</div>';
  }
  return '<div class="card-top">'
    + '<span class="tc-dot ' + state + '"></span>'
    + '<div class="card-name">' + escHtml(t.name || t.id) + '</div>'
    + badges + '</div>';
}

function metaRowHtml(t, state, isCli, isGroup) {
  var meta = STATE_META[state] || STATE_META.stopped;
  var abnormal = state === 'broken' || state === 'incomplete' || state === 'orphan';
  var statusWord = '<span class="status-word ' + state + '">' + escHtml(meta.label) + '</span>';
  var tail = '';
  if (!abnormal) {
    if (isGroup) {
      tail = statusDots(t);
    } else if (isCli) {
      tail = '<span class="card-port">CLI</span>';
    } else {
      var ports = t.ports || (t.port ? [t.port] : []);
      if (ports.length) tail = '<span class="card-port">:' + ports.join(' :') + '</span>';
    }
  }
  return '<div class="card-meta-row"><span class="card-id">' + escHtml(t.id) + '</span>' + statusWord + tail + '</div>';
}

function descHtml(t) {
  return t.description
    ? '<div class="card-desc" title="' + escAttr(t.description) + '">' + escHtml(t.description) + '</div>'
    : '<div class="card-desc placeholder">—</div>';
}

function actionsHtml(t, state, isCli) {
  var v = isVirtual(t);
  var hasCommands = t.startCommand || t.stopCommand;
  var portCount = (t.ports && t.ports.length) || (t.port ? 1 : 0);
  var isNoPortCli = portCount === 0 && hasCommands;
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

  return '<div class="card-actions">' + btns.join('') + publicBtn + '<span class="action-spacer"></span>' + toggle + '</div>';
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

function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#c44e3e;color:#fff;padding:10px 24px;font-size:13px;z-index:9999;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:600px;text-align:center;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(function() { t.style.opacity = '0'; }, 5000);
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

	async function fetchResources() {
  try {
    var r = await fetch('http://127.0.0.1:3097/api/status');
    var d = await r.json();
    var res = d.resources || {};
    var svcs = d.services || [];
    var autoCount = svcs.filter(function(s){ return s.status === 'running'; }).length;
    var autoNames = svcs.filter(function(s){ return s.status === 'running'; }).map(function(s){ return s.id; }).join(', ') || '无';
    var memLevel = res.mem >= 95 ? 'r' : res.mem >= 85 ? 'y' : 'g';
    var gpuMemPct = res.gpuMemTotal > 0 ? Math.round(res.gpuMemUsed / res.gpuMemTotal * 100) : 0;
    var gpuLevel = gpuMemPct >= 90 ? 'r' : gpuMemPct >= 80 ? 'y' : 'g';
    var html = '<span class="res-item"><span class="res-dot ' + memLevel + '"></span>内存 <span class="res-val' + (memLevel === 'r' ? ' redline' : memLevel === 'y' ? ' warn' : '') + '">' + res.mem + '%</span></span>' +
      '<span class="res-sep">|</span>' +
      '<span class="res-item">CPU <span class="res-val">' + (res.cpu||0) + '%</span></span>';
    if (res.gpuMemTotal > 0) {
      html += '<span class="res-sep">|</span>' +
        '<span class="res-item"><span class="res-dot ' + gpuLevel + '"></span>GPU <span class="res-val' + (gpuLevel === 'r' ? ' redline' : gpuLevel === 'y' ? ' warn' : '') + '">' + (res.gpuUtil||0) + '%</span> <span style="font-size:10px;color:var(--text-muted)">' + (res.gpuMemUsed/1024).toFixed(1) + '/' + (res.gpuMemTotal/1024).toFixed(1) + 'GB</span></span>';
    }
    html += '<span class="res-sep">|</span>' +
      '<span class="res-item">常驻 <span class="res-val" title="' + autoNames + '">' + autoCount + '</span></span>';
    document.getElementById('resBar').innerHTML = html;
  } catch(e) { document.getElementById('resBar').textContent = 'Supervisor 离线'; }
}

function updateCounts() {
  document.getElementById('totalCount').textContent = tools.length;
  document.getElementById('openableCount').textContent = tools.filter(function(t){return (t.running || isVirtual(t)) && !opened[t.id] && t.url;}).length;
  document.getElementById('openedCount').textContent = tools.filter(function(t){return (t.running || isVirtual(t)) && opened[t.id] && t.url;}).length;
  document.getElementById('stoppedCount').textContent = tools.filter(function(t){return t.running === false;}).length;
  document.getElementById('publicCount').textContent = tools.filter(function(t){return t.publicUrl;}).length;
}

document.addEventListener('DOMContentLoaded', function() {
  markOpened('dashboard');
  fetchTools();
  fetchStats();
  fetchCronState();
  fetchResources();
  setInterval(fetchStats, 30000);
  setInterval(fetchResources, 15000);
  initToolForm();
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
