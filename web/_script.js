
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
var starting = {}; // id â?true when waiting for start
var stopping = {}; // id â?true when waiting for stop
var opened = {};   // id â?true when user clicked "æå¼" this session
try { opened = JSON.parse(sessionStorage.getItem('opened')||'{}'); } catch(_) {}
var cronState = null;
var filter = 'all';
var domainFilter = 'all';
var formFilter = 'all';
var ownerFilter = 'all';
var publicFilter = false;
	var disabledFilter = false;

// é¢åæ å°ï¼category â?é¢åï¼ç¨äºç­éæ åç»ï¼?var domainMap = {
  'æ¨¡å': 'æ¨¡å',
  'Agent': 'Agent',
  'è®¾æ½': 'è®¾æ½',
  'è·å': 'è·å',
  'æ¥é': 'æ¥é',
  'åä½': 'åä½',
  'èè½': 'èè½',
  'å·¥ä½å?: 'èè½'
};

// åç±»æ¾ç¤ºå?+ æ¬åè§£éãkey å¹é manifest.json éç category å­æ®µ
var catMeta = {
  'æ¨¡å':     {label:'æ¨¡å',     tip:'æ¬å°+äºç«¯ AI æ¨¡åè½åï¼è§è§çè§?è¯­é³åæ/LLM API â?æ¨¡åçè°ç¨å¥å?},
  'Agent':    {label:'Agent',    tip:'èªä¸» AI Agentï¼Claude Code/Hermes/Codex CLI/RAG â?è½ç¬ç«æ§è¡ä»»å¡çæºè½ä½?},
  'è®¾æ½':     {label:'è®¾æ½',     tip:'éæåºç¡è®¾æ½ï¼APIç½å³/åè®®ä»£ç/å®æ¶è°åº¦/èé¦å·¡æ£ â?ç®¡éèªå·±è·ï¼æ¥å¸¸ä¸ç¢°'},
  'è·å':     {label:'è·å',     tip:'æ°æ®ééï¼ç½é¡µæå?ç¤¾åªä¸è½½/OCR/äºç â?ä»å¤é¨è·åä¿¡æ¯çå·¥å·'},
  'æ¥é':     {label:'æ¥é',     tip:'æµè§åç°ï¼çå¼ç»å»?Skillç®å½/æ¶æå?äººç©åå½ â?æµè§ååç?},
  'åä½':     {label:'åä½',     tip:'AIGCåå®¹çäº§ï¼å¾å?é³ä¹/è¯­é³/è§é¢/æç â?AI é©±å¨çæ°å­åå®¹åä½?},
  'èè½':     {label:'èè½',     tip:'çæ´»+æçï¼ç¨å?ç¤¾ä¿/ä¿éæ?è´­ç©/æªå¾ â?ä¸ªäººäºå¡å·¥å·'},
  'å·¥ä½å?:   {label:'å·¥ä½å?,   tip:'æä»¶å¤¹å¥å£ï¼é¡¹ç®ç®å½/äº§åºç®å½ â?æå¼å³ç¨ï¼æ éå¯å¨'}
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
  // æ¸é¤å¶ä» stat card ç?active ç¶æ?  document.querySelectorAll('.stat-card').forEach(function(c){ c.classList.remove('active'); });
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

function monogram(name) {
  var s = (name||'').trim();
  var en = s.match(/[A-Za-z][A-Za-z\s]+/);
  if (en) {
    var w = en[0].split(/\s+/).filter(Boolean);
    if (w.length >= 2) return (w[0][0] + w[w.length-1][0]).toUpperCase();
    if (w.length === 1 && w[0].length >= 2) return w[0].substring(0,2).toUpperCase();
  }
  var cn = s.replace(/[^ä¸-é¿¿]/g,'');
  if (cn.length >= 2) return cn[0] + cn[cn.length-1];
  var ascii = s.replace(/[^A-Za-z0-9]/g,'');
  if (ascii.length >= 2) return ascii.substring(0,2).toUpperCase();
  return (s.substring(0,2) || '??').toUpperCase();
}

function isVirtual(t) {
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  return !hasPorts && !t.startCommand && !t.stopCommand;
}

// å½¢ææ£æµï¼æ¬å°/API/CLI/Web
function getToolForm(t) {
	  if (t.type === 'cli' || t.type === 'command') return 'CLI';
	  if (t.type === 'folder') return 'æä»¶å¤?;
	  if (t.type === 'group') return 'å½ä»¤ç»?;
  var hasPorts = (t.ports && t.ports.length > 0) || t.port;
  var hasCommands = t.startCommand || t.stopCommand;
  var hasApi = t.apiBase;
  if (hasPorts) return 'æ¬å°';
  if (hasCommands && !hasPorts && !hasApi) return 'CLI';
  if (hasApi) return 'API';
  if (t.url && !hasPorts && !hasCommands) return 'Web';
  return 'API';
}

// å½å±æ£æµï¼èªå»º/å¤é¨
function getToolOwner(t) {
  if (t.owner) return t.owner;
  if (t.startCommand || t.stopCommand) return 'èªå»º';
  return 'å¤é¨';
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
      var setT = function(id, label, count) { var el = document.getElementById(id); if (el) el.title = label + ' Â· ' + count; };
      setT('assetTools', 'å·¥å·æ³¨åè¡?, s.assets.tools + ' ä¸?);
	      setT('assetCommands', 'Claude Code åç½®å½ä»¤', s.assets.commands + ' ä¸?);
      setT('assetTips', 'æä½æ¥å¿', s.assets.tips + ' æ?);
      setT('assetRegistry', 'æ³¨åè¡?, 'èªå¯å?+ 3 ä»½è§è?);
      setT('assetApi', 'API ææ¡£', s.assets.api + ' ä¸ªç«¯ç?);

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
      // æ¸é¤å·²çæç starting / stopping ç¶æ?      Object.keys(starting).forEach(function(id){
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
    document.getElementById('totalCount').textContent = 'â?;
    document.getElementById('openableCount').textContent = 'â?;
    document.getElementById('openedCount').textContent = 'â?;
    document.getElementById('stoppedCount').textContent = 'â?;
  }
  btn.classList.remove('spin');
  fetchStats();
  fetchCronState();
}

function getFilterDesc() {
  var parts = [];
  if (domainFilter !== 'all') parts.push(domainFilter);
  if (formFilter !== 'all') parts.push(formFilter);
  if (ownerFilter !== 'all') parts.push(ownerFilter === 'èªå»º' ? 'èªå»ºå·¥å·' : 'å¤é¨');
  if (publicFilter) parts.push('å·²é¨ç½²å¬å¼ç«?);
  return parts.length ? parts.join(' Â· ') : 'å¨é¨å·¥å·';
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
    var c = domainMap[t.category||'å¶ä»'] || 'èè½'; domainCounts[c] = (domainCounts[c] || 0) + 1;
    var f = getToolForm(t); formCounts[f] = (formCounts[f] || 0) + 1;
    var o = getToolOwner(t); ownerCounts[o] = (ownerCounts[o] || 0) + 1;
  });
  ['æ¨¡å','Agent','è®¾æ½','è·å','æ¥é','åä½','èè½'].forEach(function(c) {
    var pill = document.querySelector('.filter-pill[data-domain="' + c + '"] .pill-cnt');
    if (pill) pill.textContent = domainCounts[c] || 0;
  });
  ['æ¬å°','API','CLI','Web','å½ä»¤'].forEach(function(f) {
    var pill = document.querySelector('.filter-pill[data-form="' + f + '"] .pill-cnt');
    if (pill) pill.textContent = formCounts[f] || 0;
  });
  ['èªå»º','å¤é¨','AIæç®¡'].forEach(function(o) {
    var pill = document.querySelector('.filter-pill[data-owner="' + o + '"] .pill-cnt');
    if (pill) pill.textContent = ownerCounts[o] || 0;
  });
  var publicCnt = tools.filter(function(t){ return t.publicUrl; }).length;
  var publicPill = document.querySelector('.filter-pill[data-public] .pill-cnt');
  if (publicPill) publicPill.textContent = publicCnt;

  var disabledCnt = tools.filter(function(t){ return t.disabled; }).length;
  var disabledPill = document.getElementById('disabledCount');
  if (disabledPill) disabledPill.textContent = disabledCnt;

  // ç»´åº¦åè®¡ï¼æ ç­¾åè·æ»æ° + â?â ï¼
  var total = tools.length;
  function setDimSum(countId, okId, sum) {
    var elC = document.getElementById(countId);
    var elO = document.getElementById(okId);
    if (elC) elC.textContent = sum;
    if (elO) {
      if (sum === total) { elO.textContent = 'â?; elO.className = 'dim-ok'; }
      else { elO.textContent = 'â ç¼º' + (total - sum); elO.className = 'dim-warn'; }
    }
  }
  setDimSum('domainCount', 'domainOk', Object.values(domainCounts).reduce(function(a,b){return a+b;}, 0));
  setDimSum('formCount', 'formOk', Object.values(formCounts).reduce(function(a,b){return a+b;}, 0));
  setDimSum('ownerCount', 'ownerOk', Object.values(ownerCounts).reduce(function(a,b){return a+b;}, 0));
}

function render() {
  var grid = document.getElementById('toolGrid');
  if (!tools.length) {
    grid.innerHTML = '<div class="empty"><p>è¿æ²¡æå·¥å?/p><p>Agent ä¼å¨ <code>~/.agentboard/tools/</code> ä¸åå¥æ³¨åæä»¶ï¼èªå¨ä¸æ¶ã?/p></div>';
    document.getElementById('filterCount').innerHTML = '';
    return;
  }

  // Filter
  var sorted = tools.slice();
  if (filter === 'openable') sorted = sorted.filter(function(t){return (t.running || isVirtual(t)) && !opened[t.id] && t.url;});
  if (filter === 'opened') sorted = sorted.filter(function(t){return (t.running || isVirtual(t)) && opened[t.id] && t.url;});
  if (filter === 'stopped') sorted = sorted.filter(function(t){return t.running === false;});
  if (domainFilter !== 'all') sorted = sorted.filter(function(t){return (domainMap[t.category||'å¶ä»']||'èè½') === domainFilter;});
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
  var catOrder = {'æ¨¡å':0, 'Agent':1, 'è®¾æ½':2, 'è·å':3, 'æ¥é':4, 'åä½':5, 'èè½':6};
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
      countEl.innerHTML = desc + ' â?<strong>' + sorted.length + '</strong> / ' + tools.length + ' ä¸ªå·¥å?;
    } else {
      countEl.innerHTML = desc + ' â?<strong>' + sorted.length + '</strong> ä¸ªå·¥å?;
    }
  }

  if (!sorted.length) {
    grid.innerHTML = '<div class="empty"><p style="font-size:28px;margin-bottom:4px">(â¯Â°â¡Â°)â?/p><p>æ²¡æå·¥å·å¹éå½åç­éç»å?/p><p style="font-size:12px;margin-top:6px">' + getFilterDesc() + '</p><a class="reset-link" onclick="resetAllFilters()">â?éç½®å¨é¨ç­é?/a></div>';
    return;
  }

  grid.innerHTML = sorted.map(function(t){
    var ports = t.ports || (t.port ? [t.port] : []);
    var portsText = ports.length ? 'ç«¯å£ ' + ports.map(function(p){return ':'+p;}).join(', ') : '';
    var v = isVirtual(t);
    var hasCommands = t.startCommand || t.stopCommand;
    var cmdType = t.type || 'service';
		var isCli = cmdType === 'cli' || cmdType === 'command';
var klass = isCli ? 'cmd' : (cmdType === 'folder' ? 'folder' : (t.running ? 'on' : 'off'));
    var pending = starting[t.id];
    var halting = stopping[t.id];

    var isSelf = t.id === 'dashboard';
    var portCount = (t.ports && t.ports.length) || (t.port ? 1 : 0);
    var isNoPortCli = portCount === 0 && hasCommands;

    // Group card rendering
    if (cmdType === 'group') {
      var children = t.children || [];
      var tasks = children.filter(function(c){ return c.type !== 'section'; });
      var statusDots = tasks.map(function(c){
        var st = getCronChildStatus(c.name);
        var cls = st ? st.cls : 'idle';
        return '<span class="gc-dot ' + cls + '" title="' + c.name + ': ' + (st ? st.label : 'idle') + '">â?/span>';
      }).join('');
      return '<div class="tool-card group-card" data-id="' + t.id + '" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)"' + (t.url ? ' onclick="window.open(\'' + t.url + '\', \'_blank\')" style="cursor:pointer"' : '') + '>'
        + '<span class="card-dot off"></span>'
        + '<div class="card-drag-handle" title="ææ½æåº" draggable="true" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"></div>'
        + '<div class="card-body">'
          + '<div class="card-mono">' + (t.icon||monogram(t.name)) + '</div>'
          + '<div class="card-info">'
            + '<div class="card-name">' + t.name + '</div>'
            + '<div class="card-id">' + t.id + '</div>'
            + '<div class="card-meta">' + statusDots + '</div>'
            + (t.description ? '<div class="card-desc">' + t.description + '</div>' : '')
          + '</div>'
        + '</div>'
        + '<div class="card-actions">'
          + (t.url ? '<a href="' + t.url + '" target="_blank" class="btn" onclick="event.stopPropagation()" style="font-size:11px">æå¼é¢æ¿</a>' : '')
        + '</div>'
      + '</div>';
    }

    var actionHtml = '';
    if (pending) {
      actionHtml = '<button class="btn go starting">' + (isNoPortCli ? 'å¯å¨ä¸­â? : 'å¯å¨ä¸­â?) + '</button>';
    } else if (halting) {
      actionHtml = '<button class="btn stop" style="opacity:.6">åæ­¢ä¸­â?/button>';
    } else if (cmdType === 'folder') {
      actionHtml = '<button class="btn go" onclick="event.stopPropagation();window.open(\'/workspace/' + t.id + '\', \'_blank\')">æ¥çé¡¹ç®</button>';
    } else if (hasCommands && !isSelf && !isCli) {
      if (isNoPortCli) {
        actionHtml = '<button class="btn go" onclick="event.stopPropagation();startTool(\'' + t.id + '\')">ç»ç«¯</button>';
      } else if (t.running) {
        actionHtml = '<button class="btn stop" onclick="event.stopPropagation();stopTool(\'' + t.id + '\')">åæ­¢</button>';
      } else {
        actionHtml = '<button class="btn go" onclick="event.stopPropagation();startTool(\'' + t.id + '\')">å¯å¨</button>';
      }
    }

    var toolForm = getToolForm(t);
    var toolOwner = getToolOwner(t);
    var formBadge = '<span class="form-badge badge-' + toolForm + '">' + toolForm + '</span>';
    var ownerBadge = toolOwner === 'èªå»º' ? '' : '<span class="owner-badge">' + toolOwner + '</span>';

    var isOpened = opened[t.id];
    var openLabel = isOpened ? 'æå¼ä¸? : 'æå¼';
    var openClass = isOpened ? 'btn open-done' : 'btn';
    var openBtn = (t.url && (t.running || v)) ? '<a href="' + t.url + '" target="_blank" class="' + openClass + '" onclick="event.stopPropagation();markOpened(\'' + t.id + '\')">' + openLabel + '</a>' : '';
    var publicBtn = t.publicUrl ? '<a href="' + t.publicUrl + '" target="_blank" class="btn public" onclick="event.stopPropagation()" title="å¬å¼ç«? ' + t.publicUrl + '">å¬å¼ç«?/a>' : '';

    var extraClass = v ? ' virtual' : ''; if (isSelf) extraClass += ' self'; if (isCli) extraClass += ' cmd-card'; if (cmdType === 'folder') extraClass += ' folder-card'; if (t.disabled) extraClass += ' disabled';
	return '<div class="tool-card' + extraClass + '" data-id="' + t.id + '" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)"' + (cmdType === 'folder' ? ' onclick="window.open(\'/workspace/' + t.id + '\', \'_blank\')" style="cursor:pointer"' : '') + '>'
      + '<span class="card-dot ' + klass + '"></span>'
      + '<div class="card-drag-handle" title="ææ½æåº" draggable="true" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"></div>'
      + '<div class="card-body">'
        + '<div class="card-mono">' + monogram(t.name) + '</div>'
        + '<div class="card-info">'
          + '<div class="card-name">' + (t.icon||'') + ' ' + t.name + '</div>'
          + '<div class="card-id">' + t.id + '</div>'
          + (isCli && t.trigger ? '<div class="card-meta"><span class="card-trigger">/' + t.trigger + '</span></div>' : (portsText ? '<div class="card-meta">' + portsText + '</div>' : (cmdType === 'folder' ? '<div class="card-meta">æä»¶å¤?/div>' : '')))
          + (t.description ? '<div class="card-desc" title="' + t.description.replace(/"/g,'&quot;') + '">' + t.description + '</div>' : '')
        + '</div>'
      + '</div>'
      + '<div class="card-actions">' + (isCli ? '<span class="cmd-hint">å?Claude Code ä¸­è¾å?/span>' : (openBtn||'') + (actionHtml||'') + (publicBtn||'')) + '<span class="card-badges">' + formBadge + ownerBadge + '</span>' + '<label class="toggle-disable" onclick="event.stopPropagation();toggleDisabled(\'' + t.id + '\')"><input type="checkbox"' + (t.disabled ? '' : ' checked') + '><span class="toggle-track' + (t.disabled ? '' : ' on') + '"></span><span class="toggle-label' + (t.disabled ? '' : ' on') + '">' + (t.disabled ? 'åç¨' : 'å¯ç¨') + '</span></label></div>'
    + '</div>';
  }).join('');
}

function getCronChildStatus(childName) {
  if (!cronState || !cronState.jobs) return null;
  var job = cronState.jobs.find(function(j) { return j.name.indexOf(childName) !== -1; });
  if (!job) return null;
  var ts = cronState.state && cronState.state.tasks ? cronState.state.tasks[job.id] : null;
  if (!ts || !ts.lastStatus) return { cls: 'idle', label: 'idle' };
  switch (ts.lastStatus) {
    case 'success': return { cls: 'success', label: 'æå' };
    case 'error': return { cls: 'error', label: 'å¤±è´¥(' + (ts.consecutiveErrors || 0) + 'æ¬?' };
    case 'fatal_error': return { cls: 'fatal_error', label: 'ä»æ¥å·²åæ­? };
    case 'output_missing': return { cls: 'output_missing', label: 'äº§åºç¼ºå¤±' };
    default: return { cls: 'unknown', label: ts.lastStatus };
  }
}

function markOpened(id) {
  opened[id] = true;
  try { sessionStorage.setItem('opened', JSON.stringify(opened)); } catch(_) {}
  updateCounts();
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
      alert('å¯å¨å¤±è´¥: ' + (data.error||'æªç¥éè¯¯'));
    }
  } catch(e) {
    delete starting[id];
    render();
    alert('è¿æ¥å¤±è´¥');
  }
}

async function stopTool(id) {
  // ç¡®è®¤æºå¶ï¼ç¬¬ä¸æ¬¡ç¹å?ç¡®è®¤åæ­¢ï¼?ï¼?ç§ååç¹ææ§è¡?  var stopBtn = document.querySelector('.tool-card[data-id="' + id + '"] .btn.stop');
  if (stopBtn && !stopBtn.classList.contains('confirming')) {
    stopBtn.textContent = 'ç¡®è®¤åæ­¢ï¼?;
    stopBtn.classList.add('confirming');
    setTimeout(function(){
      if (stopBtn.classList.contains('confirming')) {
        stopBtn.textContent = 'åæ­¢';
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
      alert('åæ­¢å¤±è´¥: ' + (data.error||'æªç¥éè¯¯'));
    }
  } catch(e) {
    delete stopping[id];
    render();
    alert('è¿æ¥å¤±è´¥');
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

	function updateCounts() {
  document.getElementById('totalCount').textContent = tools.length;
  document.getElementById('openableCount').textContent = tools.filter(function(t){return (t.running || isVirtual(t)) && !opened[t.id] && t.url;}).length;
  document.getElementById('openedCount').textContent = tools.filter(function(t){return (t.running || isVirtual(t)) && opened[t.id] && t.url;}).length;
  document.getElementById('stoppedCount').textContent = tools.filter(function(t){return t.running === false;}).length;
  document.getElementById('publicCount').textContent = tools.filter(function(t){return t.publicUrl;}).length;
}

function saveCardOrder() {
  var cards = document.querySelectorAll('.tool-card');
  var ids = [];
  cards.forEach(function(c){ ids.push(c.getAttribute('data-id')); });
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem('agentboard-card-order') || '[]'); } catch(_) {}
  if (!Array.isArray(saved)) saved = [];
  var existing = {};
  saved.forEach(function(id, idx){ existing[id] = idx; });
  ids.forEach(function(id){ delete existing[id]; });
  var remaining = Object.keys(existing).sort(function(a,b){ return existing[a] - existing[b]; });
  var cardOrder = ids.concat(remaining);
  try { localStorage.setItem('agentboard-card-order', JSON.stringify(cardOrder)); } catch(_) {}
}

var dragSrcId = null;

function handleDragStart(e) {
  var card = e.target.closest('.tool-card');
  if (!card) return;
  dragSrcId = card.getAttribute('data-id');
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var card = e.target.closest('.tool-card');
  if (card && card.getAttribute('data-id') !== dragSrcId) {
    card.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  var target = e.target.closest('.tool-card');
  if (!target) return;
  var targetId = target.getAttribute('data-id');
  if (targetId === dragSrcId) return;
  var grid = document.getElementById('toolGrid');
  var cards = grid.querySelectorAll('.tool-card');
  var srcIdx = -1, tgtIdx = -1, srcCard = null;
  cards.forEach(function(c, i){
    if (c.getAttribute('data-id') === dragSrcId) { srcIdx = i; srcCard = c; }
    if (c.getAttribute('data-id') === targetId) tgtIdx = i;
  });
  if (!srcCard) return;
  if (srcIdx < tgtIdx) {
    target.parentNode.insertBefore(srcCard, target.nextSibling);
  } else {
    target.parentNode.insertBefore(srcCard, target);
  }
  saveCardOrder();
  target.classList.remove('drag-over');
}

function handleDragEnd(e) {
  var card = e.target.closest('.tool-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.tool-card.drag-over').forEach(function(c){ c.classList.remove('drag-over'); });
  dragSrcId = null;
}

document.addEventListener('DOMContentLoaded', function() {
  try { var co = JSON.parse(localStorage.getItem('agentboard-card-order') || '[]'); if (!Array.isArray(co)) localStorage.removeItem('agentboard-card-order'); } catch(_) { localStorage.removeItem('agentboard-card-order'); }
  markOpened('dashboard');
  fetchTools();
  fetchStats();
  fetchCronState();
  setInterval(fetchStats, 30000);
});
