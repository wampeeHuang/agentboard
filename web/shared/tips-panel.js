/* ═══════════════════════════════════════════════════════════
   tips-panel.js — 经验日志面板唯一规范组件（一源多端）
   调度中心 :3100 与 工具架 :3099 引用同一份，两站逐像素一致。
   宿主页需先定义 window.TIPS_CFG：
     api       列表接口（GET 返回 {tips:[...]}）
     constUrl  宪法接口（返回 JSON{content} 或 raw text）
     fileUrl   单条接口前缀（GET/PUT/DELETE /:file）
     normList  (data)=>数组
     normBody  (data)=>md 字符串（兼容 JSON{content} 与 raw text）
     sectionSel 本面板所在 section 选择器（注入 .tips-panel-root 命名空间）
     stdTitle  宪法弹窗标题
   宿主页调用 window.TipsPanel.load() 首次渲染。
   暴露 window.TipsPanel.renderMarkdown 与 window.md2html 别名。
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.TIPS_CFG || {};
  var api = CFG.api || '/api/tips';
  var constUrl = CFG.constUrl || api + '/const';
  var fileUrl = CFG.fileUrl || api + '/';
  var sectionSel = CFG.sectionSel || '[data-page="tips"]';
  var stdTitle = CFG.stdTitle || '操作日志宪法';
  var normList = CFG.normList || function (d) { return (d && d.tips) || []; };
  var normBody = CFG.normBody || function (d) { return typeof d === 'string' ? d : (d && d.content) || ''; };

  /* ── 类型元数据 ── */
  var TIP_DEFS = [['all', '全部'], ['diagnosis', '诊断'], ['method', '方法'], ['fact', '事实'], ['capability', '能力'], ['feedback', '反馈']];
  var TIP_CHAR = { diagnosis: '诊', method: '方', fact: '事', capability: '能', feedback: '反' };
  var TIP_LABEL = { diagnosis: '诊断', method: '方法', fact: '事实', capability: '能力', feedback: '反馈' };
  var TIP_GEO = {
    diagnosis: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    method: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    fact: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4 L10.6 6 L6 10.6 L1.4 6 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    capability: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.6 6 H10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 1.6 V10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    feedback: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.4 A4.6 4.6 0 0 1 6 10.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  };

  /* ── 领域元数据（独立口：general 通用 + 各机制生态子目录，标签页按此渲染）── */
  var DOMAIN_DEFS = [['all', '全部'], ['general', '通用'], ['dsh', 'DSH'], ['cron', 'Cron']];
  var DOMAIN_LABEL = { general: '通用', dsh: 'DSH', cron: 'Cron' };

  /* ── 作者元数据（来源：谁写的，枚举 + 其他兜底）── */
  var AUTHOR_DEFS = [['all', '全部'], ['人工', '人工'], ['dsh-agent', 'dsh-agent'], ['claude', 'claude'], ['codex', 'codex'], ['cron', 'cron'], ['其他', '其他']];

  /* ── 筛选分类悬停气泡文案（作者/领域/类型）── */
  var DIM_DESC = {
    author: { all: '所有来源', '人工': '你手动写的', 'dsh-agent': 'DeepSeek Harness agent 沉淀', claude: 'Claude 沉淀', codex: 'Codex 沉淀', cron: '定时任务沉淀', '其他': '未知来源' },
    domain: { all: '所有领域', general: '不依附任何系统的经验', dsh: 'DeepSeek Harness 专属', cron: '调度中心专属' },
    type: { all: '所有类型', diagnosis: '为什么X会这样？因果链路', method: '怎么做X？步骤序列', fact: 'X在哪/是什么？', capability: '我能用X在Y场景做什么', feedback: '用户/环境的纠正' }
  };

  /* ── 宪法 §三 承接：每类型分区字段 ──
     [分区标题, slot] 顺序即保存顺序；capability 额外 tool/scenario 进 frontmatter */
  var SCHEMA = {
    diagnosis: [['现象', 'phen'], ['根因', 'cause'], ['修复', 'act'], ['预防', 'prev']],
    method: [['现象', 'phen'], ['根因', 'cause'], ['步骤', 'act'], ['预防', 'prev']],
    fact: [['现象', 'phen'], ['根因', 'cause'], ['修复/步骤', 'act'], ['预防', 'prev']],
    feedback: [['现象', 'phen'], ['根因', 'cause'], ['修复/步骤', 'act'], ['预防', 'prev']],
    capability: [['能力', 'cap'], ['为什么只能用这个', 'why'], ['速查', 'quick']]
  };
  var SLOT_ALIAS = { '修复': 'act', '步骤': 'act', '修复/步骤': 'act', '现象': 'phen', '根因': 'cause', '预防': 'prev', '能力': 'cap', '为什么只能用这个': 'why', '速查': 'quick' };
  var PH_PHEN = '你看到了什么';
  var PH_CAUSE_DIAG = '为什么发生（诊断必填）';
  var PH_CAUSE_OTHER = '为什么发生（方法/事实可省略）';
  var PH_ACT = '怎么修好的 / 怎么做';
  var PH_PREV = '下次怎么避免';
  var PH_CAP = '这个工具+场景组合能做什么事';
  var PH_WHY = '其他方案为什么不行——防止重复探索的关键';
  var PH_QUICK = '一行命令或关键步骤，快速回忆怎么调';
  var SEC_PLACEHOLDER = { phen: PH_PHEN, cause: PH_CAUSE_DIAG, act: PH_ACT, prev: PH_PREV, cap: PH_CAP, why: PH_WHY, quick: PH_QUICK };
  var CAP_SLOTS = { cap: 1, why: 1, quick: 1 };

  var state = { data: [], filter: 'all', domainFilter: 'all', authorFilter: 'all', search: '', editFile: null, formType: 'diagnosis', sections: [] };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s); }
  var _tipToastEl = null, _tipToastTimer = null;
  function toast(m, t) {
    if (window.toast) { window.toast(m, t); return; }
    if (window.showToast) { window.showToast(m); return; }
    // 组件自带轻量 toast（宿主无 toast 时兜底，避免原生 alert 阻塞）
    if (!_tipToastEl) {
      _tipToastEl = document.createElement('div');
      _tipToastEl.className = 'tips-toast';
      document.body.appendChild(_tipToastEl);
    }
    _tipToastEl.textContent = m;
    _tipToastEl.classList.add('show');
    clearTimeout(_tipToastTimer);
    _tipToastTimer = setTimeout(function () {
      _tipToastEl.classList.remove('show');
    }, 2200);
  }

  /* ── 规范 markdown 渲染器（代码块 / ul / thead 表格） ── */
  function mdInline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    return s;
  }
  function mdTableRow(l, tag) {
    var cells = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
    var h = '';
    cells.forEach(function (c) {
      c = c.trim();
      h += (tag === 'th' ? '<th>' : '<td>') + mdInline(c) + (tag === 'th' ? '</th>' : '</td>');
    });
    return '<tr>' + h + '</tr>';
  }
  function renderMarkdown(src) {
    var lines = src.split('\n');
    var out = [], inCode = false, codeBuf = [], listBuf = [];
    function flushList() {
      if (listBuf.length) { out.push('<ul>' + listBuf.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'); listBuf = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (inCode) {
        if (/^```/.test(L)) { out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>'); inCode = false; codeBuf = []; }
        else codeBuf.push(esc(L));
        continue;
      }
      if (/^```/.test(L)) { flushList(); inCode = true; codeBuf = []; continue; }
      var m;
      if (m = L.match(/^\s*(#{1,6})\s+(.*)$/)) { flushList(); var n = m[1].length; out.push('<h' + n + '>' + mdInline(m[2]) + '</h' + n + '>'); continue; }
      if (/^\s*[-*]\s+/.test(L)) { var li = L.replace(/^\s*[-*]\s+/, ''); listBuf.push(mdInline(li)); continue; }
      if (/^\s*>\s?/.test(L)) { flushList(); out.push('<blockquote>' + mdInline(L.replace(/^\s*>\s?/, '')) + '</blockquote>'); continue; }
      if (/^\s*\|/.test(L)) {
        flushList();
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        i--;
        if (rows.length) {
          var tbl = '<table><thead>' + mdTableRow(rows[0], 'th') + '</thead><tbody>';
          for (var r = 1; r < rows.length; r++) {
            if (/^[\s:|-]+$/.test(rows[r].trim())) continue;
            tbl += mdTableRow(rows[r], 'td');
          }
          tbl += '</tbody></table>';
          out.push(tbl);
        }
        continue;
      }
      if (/^\s*-{3,}\s*$/.test(L)) { flushList(); out.push('<hr>'); continue; }
      if (/^\s*$/.test(L)) { flushList(); continue; }
      flushList();
      out.push('<p>' + mdInline(L) + '</p>');
    }
    flushList();
    if (inCode) out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
    return out.join('');
  }

  /* ── 列表渲染 ── */
  /* 领域归属：frontmatter domain 优先；其次按文件路径前缀（dsh/xxx.md → dsh）；否则通用 */
  function tipDomain(x) {
    if (x && typeof x.domain === 'string' && x.domain) return x.domain;
    var f = (x && x.file) || '';
    var i = f.indexOf('/');
    if (i > 0) return f.slice(0, i);
    return 'general';
  }
  /* 作者归属：frontmatter author；缺省视为"其他"（未知来源） */
  function tipAuthor(x) {
    return (x && typeof x.author === 'string' && x.author) ? x.author : '其他';
  }
  function tipList() {
    var list = state.data;
    if (state.filter !== 'all') list = list.filter(function (t) { return t.type === state.filter; });
    if (state.domainFilter !== 'all') {
      var df = state.domainFilter;
      list = list.filter(function (t) { return tipDomain(t) === df; });
    }
    if (state.authorFilter !== 'all') {
      var af = state.authorFilter;
      list = list.filter(function (t) { return tipAuthor(t) === af; });
    }
    if (state.search) {
      var q = state.search.toLowerCase();
      list = list.filter(function (t) {
        return (t.title || '').toLowerCase().indexOf(q) >= 0 ||
               (t.desc || '').toLowerCase().indexOf(q) >= 0 ||
               (t.file || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    return list;
  }
  /* ── 筛选分类悬停气泡（白底，复用站内 tip-bubble 风格）── */
  var _tipBubble = null, _tipBubbleTimer = null;
  function showBubble(opt) {
    var desc = opt.getAttribute('data-desc');
    if (!desc) return;
    if (!_tipBubble) {
      _tipBubble = document.createElement('div');
      _tipBubble.className = 'tips-bubble';
      _tipBubble.style.display = 'none';
      document.body.appendChild(_tipBubble);
    }
    _tipBubble.textContent = desc;
    var r = opt.getBoundingClientRect();
    _tipBubble.style.display = 'block';
    var bw = _tipBubble.offsetWidth;
    _tipBubble.style.left = Math.min(Math.max(r.left, 8), window.innerWidth - bw - 8) + 'px';
    _tipBubble.style.top = (r.bottom + 6) + 'px';
  }
  function hideBubble() {
    clearTimeout(_tipBubbleTimer);
    if (_tipBubble) _tipBubble.style.display = 'none';
  }

  function renderDims() {
    var wrap = $('tipDimBlocks');
    if (!wrap) return;
    var tCounts = {}, dCounts = {}, aCounts = {};
    state.data.forEach(function (x) {
      var k = x.type || '';
      tCounts[k] = (tCounts[k] || 0) + 1;
      var dk = tipDomain(x);
      dCounts[dk] = (dCounts[dk] || 0) + 1;
      var ak = tipAuthor(x);
      aCounts[ak] = (aCounts[ak] || 0) + 1;
    });
    var html = '<div class="dim-block dim-author"><div class="dim-block-title">作者</div><div class="dim-block-opts">';
    AUTHOR_DEFS.forEach(function (d) {
      var n = d[0] === 'all' ? state.data.length : (aCounts[d[0]] || 0);
      html += '<span class="dim-opt' + (state.authorFilter === d[0] ? ' active' : '') + '" data-tipa="' + d[0] + '" data-desc="' + escAttr(DIM_DESC.author[d[0]] || '') + '">' + d[1] + '<span class="d-n">' + n + '</span></span>';
    });
    html += '</div></div>';
    html += '<div class="dim-block dim-domain"><div class="dim-block-title">领域</div><div class="dim-block-opts">';
    DOMAIN_DEFS.forEach(function (d) {
      var n = d[0] === 'all' ? state.data.length : (dCounts[d[0]] || 0);
      html += '<span class="dim-opt' + (state.domainFilter === d[0] ? ' active' : '') + '" data-tipd="' + d[0] + '" data-desc="' + escAttr(DIM_DESC.domain[d[0]] || '') + '">' + d[1] + '<span class="d-n">' + n + '</span></span>';
    });
    html += '</div></div>';
    html += '<div class="dim-block dim-status"><div class="dim-block-title">类型</div><div class="dim-block-opts">';
    TIP_DEFS.forEach(function (d) {
      var n = d[0] === 'all' ? state.data.length : (tCounts[d[0]] || 0);
      html += '<span class="dim-opt' + (state.filter === d[0] ? ' active' : '') + '" data-tipf="' + d[0] + '" data-desc="' + escAttr(DIM_DESC.type[d[0]] || '') + '">' + d[1] + '<span class="d-n">' + n + '</span></span>';
    });
    html += '</div></div>';
    wrap.innerHTML = html;
  }
  function emptyHtml() {
    return '<div class="empty"><div class="empty-icon"><svg class="geo-empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19 L12 6 L20 19 Z"/><path d="M8 13.5 H16"/></svg></div><div class="empty-title">没有匹配的日志</div><div class="empty-desc">换个筛选，或点「+ 新增日志」沉淀一条</div></div>';
  }
  function card(x) {
    var type = x.type || 'diagnosis';
    var geo = TIP_GEO[type] || TIP_GEO.diagnosis;
    var label = TIP_LABEL[type] || type;
    var desc = (x.desc || '').slice(0, 200);
    var dom = tipDomain(x);
    var domLabel = DOMAIN_LABEL[dom] || dom;
    return '<div class="tool-card">'
      + '<div class="card-top"><span class="card-ico">' + esc(TIP_CHAR[type] || '记') + '</span><span class="card-name">' + esc(x.title || x.file) + '</span></div>'
      + '<div class="card-meta-row">'
      + '<div class="cf"><div class="cf-l">作者</div><div class="tip-meta-val">' + esc(x.author || '其他') + '</div></div>'
      + '<div class="cf"><div class="cf-l">领域</div><div class="tip-domain" data-domain="' + escAttr(dom) + '">' + esc(domLabel) + '</div></div>'
      + '<div class="cf"><div class="cf-l">类型</div><div class="tip-type" data-type="' + escAttr(type) + '">' + geo + '<span>' + esc(label) + '</span></div></div>'
      + '<div class="cf"><div class="cf-l">来源</div><div class="tip-meta-val">' + esc(x.source || '') + '</div></div>'
      + '</div>'
      + '<div class="card-actions"><span class="p4-spacer"></span>'
      + '<button class="btn" data-act="edit" data-file="' + escAttr(x.file) + '">编辑</button>'
      + '<button class="btn btn-danger" data-act="del" data-file="' + escAttr(x.file) + '">删除</button>'
      + '</div>'
      + '</div>';
  }
  function renderGrid() {
    var grid = $('tipGrid');
    if (!grid) return;
    var list = tipList();
    grid.innerHTML = list.length ? list.map(card).join('') : emptyHtml();
  }

  /* ── 宪法查看 ── */
  function openStd() {
    var body = $('tips-std-body');
    var ov = $('tips-std-overlay');
    if (!body || !ov) return;
    ov.classList.add('show');
    body.innerHTML = '<div class="empty">加载中…</div>';
    fetch(constUrl)
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, t: t }; }); })
      .then(function (res) {
        if (!res.ok) { body.innerHTML = '<div class="empty">写入标准读取失败</div>'; return; }
        var md = res.t;
        try { var j = JSON.parse(md); if (j && j.content) md = j.content; } catch (_) { /* raw text */ }
        body.innerHTML = renderMarkdown(md);
      })
      .catch(function (e) { body.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>'; });
  }
  function closeStd() { var ov = $('tips-std-overlay'); if (ov) ov.classList.remove('show'); }

  /* ── 表单（承接宪法分区字段） ── */
  function schemaFor(type) { return SCHEMA[type] || SCHEMA.diagnosis; }
  function placeholderFor(slot, type) {
    if (slot === 'cause') return type === 'diagnosis' ? PH_CAUSE_DIAG : PH_CAUSE_OTHER;
    return SEC_PLACEHOLDER[slot] || '';
  }
  function buildSectionFields() {
    var box = $('tips-sec-fields');
    if (!box) return;
    var html = '';
    schemaFor(state.formType).forEach(function (pair) {
      var key = pair[0], slot = pair[1];
      var cur = null;
      state.sections.forEach(function (s) { if (s.slot === slot) cur = s; });
      var val = cur ? cur.val : '';
      html += '<div class="tips-field"><label>' + esc(key) + '</label>'
        + '<textarea class="tips-sec-ta" data-sec="' + slot + '" rows="3" placeholder="' + esc(placeholderFor(slot, state.formType)) + '">' + esc(val) + '</textarea></div>';
    });
    box.innerHTML = html;
  }
  function formTypeChange() {
    state.formType = $('tips-tp-type').value;
    var cap = $('tips-cap-fields');
    if (cap) cap.hidden = state.formType !== 'capability';
    // 切出 capability 时清空 tool/scenario，防残留旧值写入 frontmatter
    if (state.formType !== 'capability') {
      var tool = $('tips-tp-tool'), scen = $('tips-tp-scenario');
      if (tool) tool.value = '';
      if (scen) scen.value = '';
    }
    // 重建分区骨架：textareas 只从 state.sections 渲染，必须先有 slot 才可写
    state.sections = schemaFor(state.formType).map(function (pair) {
      return { slot: pair[1], key: pair[0], val: '' };
    });
    buildSectionFields();
  }
  function openForm() {
    state.editFile = null;
    $('tips-form-title').textContent = '新增日志';
    $('tips-tp-type').value = 'diagnosis';
    $('tips-tp-domain').value = 'general';
    $('tips-tp-author').value = '人工';
    $('tips-tp-title').value = '';
    $('tips-tp-source').value = '';
    var tool = $('tips-tp-tool'), scen = $('tips-tp-scenario');
    if (tool) tool.value = '';
    if (scen) scen.value = '';
    state.sections = [];
    state.formType = 'diagnosis';
    formTypeChange();
    $('tips-form-overlay').classList.add('show');
    setTimeout(function () { $('tips-tp-title').focus(); }, 60);
  }
  function openEdit(file) {
    state.editFile = file;
    $('tips-form-title').textContent = '编辑日志';
    $('tips-form-overlay').classList.add('show');
    fetch(fileUrl + encodeURIComponent(file))
      .then(function (r) { return r.text().then(function (t) { return { ok: r.ok, text: t }; }); })
      .then(function (res) {
        if (!res.ok) { toast('读取失败', 'error'); return; }
        var d;
        try { d = JSON.parse(res.text); } catch (e) { d = res.text; }
        var md = normBody(d).replace(/\r\n/g, '\n');
        var type = 'diagnosis', source = '', tool = '', scenario = '', domain = 'general', author = '人工', rest = md, title = '';
        var fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fm) {
          var f = fm[1];
          var t = f.match(/^type:\s*(.+)$/m); if (t) type = t[1].trim();
          var s = f.match(/^source:\s*(.+)$/m); if (s) source = s[1].trim();
          var tl = f.match(/^tool:\s*(.+)$/m); if (tl) tool = tl[1].trim();
          var sc = f.match(/^scenario:\s*(.+)$/m); if (sc) scenario = sc[1].trim();
          var dm = f.match(/^domain:\s*(.+)$/m); if (dm) domain = dm[1].trim();
          var au = f.match(/^author:\s*(.+)$/m); if (au) author = au[1].trim();
          rest = md.slice(fm[0].length);
        }
        var h1 = rest.match(/^#\s+(.+)$/m);
        if (h1) { title = h1[1].trim(); rest = rest.slice(h1.index + h1[0].length).replace(/^\n+/, ''); }
        // 解析 ## 分区回填 slot
        var slots = {};
        var curSlot = null, curBuf = [];
        rest.split('\n').forEach(function (line) {
          var hm = line.match(/^##\s+(.+)$/);
          if (hm) {
            if (curSlot && curBuf.join('').trim()) slots[curSlot] = curBuf.join('\n').trim();
            curSlot = SLOT_ALIAS[hm[1].trim()] || null;
            curBuf = [];
            return;
          }
          if (curSlot) curBuf.push(line);
        });
        if (curSlot && curBuf.join('').trim()) slots[curSlot] = curBuf.join('\n').trim();
        var typeVal = TIP_LABEL[type] ? type : 'diagnosis';
        $('tips-tp-type').value = typeVal;
        $('tips-tp-title').value = title;
        $('tips-tp-source').value = source;
        var domEl = $('tips-tp-domain'); if (domEl) domEl.value = domain === 'general' || domain === 'dsh' || domain === 'cron' ? domain : 'general';
        var authEl = $('tips-tp-author'); if (authEl) authEl.value = author || '人工';
        state.formType = typeVal;
        formTypeChange(); // 先重建骨架，再回填分区（formTypeChange 会重置 state.sections）
        state.sections = schemaFor(typeVal).map(function (pair) {
          return { slot: pair[1], key: pair[0], val: slots[pair[1]] || '' };
        });
        var toolEl = $('tips-tp-tool'), scenEl = $('tips-tp-scenario');
        if (toolEl) toolEl.value = tool;
        if (scenEl) scenEl.value = scenario;
        buildSectionFields();
      })
      .catch(function () { toast('加载日志失败', 'error'); });
  }
  function closeForm() { var ov = $('tips-form-overlay'); if (ov) ov.classList.remove('show'); }
  function buildDesc() {
    var parts = [];
    state.sections.forEach(function (s) {
      var v = (s.val || '').trim();
      if (v) parts.push('## ' + s.key + '\n\n' + v);
    });
    return parts.join('\n\n');
  }
  function save() {
    var title = $('tips-tp-title').value.trim();
    if (!title) { toast('标题必填', 'error'); $('tips-tp-title').focus(); return; }
    var type = $('tips-tp-type').value;
    var source = $('tips-tp-source').value.trim();
    var domain = $('tips-tp-domain').value;
    var author = $('tips-tp-author').value;
    var toolEl = $('tips-tp-tool'), scenEl = $('tips-tp-scenario');
    var body = {
      title: title,
      type: type,
      source: source,
      domain: domain,
      author: author,
      tool: toolEl ? toolEl.value.trim() : '',
      scenario: scenEl ? scenEl.value.trim() : '',
      desc: buildDesc()
    };
    var url = api, method = 'POST';
    if (state.editFile) { url = fileUrl + encodeURIComponent(state.editFile); method = 'PUT'; }
    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { toast((res.d && res.d.error) || '保存失败', 'error'); return; }
        toast(state.editFile ? '日志已更新' : '日志已创建', 'ok');
        closeForm();
        load();
      })
      .catch(function () { toast('保存失败', 'error'); });
  }
  function del(file) {
    var x = null;
    state.data.forEach(function (t) { if (t.file === file) x = t; });
    if (!confirm('删除日志「' + (x && x.title ? x.title : file) + '」？此操作不可恢复。')) return;
    fetch(fileUrl + encodeURIComponent(file), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) { toast('已删除', 'ok'); load(); }
        else toast((d && d.error) || '删除失败', 'error');
      })
      .catch(function () { toast('删除失败', 'error'); });
  }

  /* ── overlay 注入（两站同一份 DOM） ── */
  var OVERLAY_HTML =
    '<div class="tips-overlay" id="tips-form-overlay">'
    + '<div class="tips-form">'
    + '<div class="tips-form-head"><span class="tips-form-title" id="tips-form-title">新增日志</span><button class="tips-form-close" data-tips-close>x</button></div>'
    + '<div class="tips-form-body">'
    + '<div class="tips-field"><label>作者</label><select id="tips-tp-author">'
    + '<option value="人工">人工</option><option value="dsh-agent">dsh-agent</option><option value="claude">claude</option><option value="codex">codex</option><option value="cron">cron</option><option value="其他">其他</option>'
    + '</select></div>'
    + '<div class="tips-field"><label>领域</label><select id="tips-tp-domain">'
    + '<option value="general">通用</option><option value="dsh">DSH</option><option value="cron">Cron</option>'
    + '</select></div>'
    + '<div class="tips-field"><label>类型</label><select id="tips-tp-type">'
    + '<option value="diagnosis">诊断</option><option value="method">方法</option><option value="fact">事实</option><option value="capability">能力</option><option value="feedback">反馈</option>'
    + '</select></div>'
    + '<div class="tips-field"><label>标题 <span class="tips-req">*</span></label><input id="tips-tp-title" placeholder="一句话洞察标题"></div>'
    + '<div class="tips-field"><label>来源</label><input id="tips-tp-source" placeholder="触发提炼的事件/任务（可留空）"></div>'
    + '<div class="tips-cap-fields" id="tips-cap-fields" hidden>'
    + '<div class="tips-field"><label>工具</label><input id="tips-tp-tool" placeholder="工具名（capability 前门面字段）"></div>'
    + '<div class="tips-field"><label>场景</label><input id="tips-tp-scenario" placeholder="什么场景下用（capability 前门面字段）"></div>'
    + '</div>'
    + '<div class="tips-sec-fields" id="tips-sec-fields"></div>'
    + '<div class="tips-form-actions">'
    + '<button class="tips-btn tips-btn-ghost" data-tips-std>写入标准 ↗</button>'
    + '<span class="tips-spacer"></span>'
    + '<button class="tips-btn" data-tips-cancel>取消</button>'
    + '<button class="tips-btn tips-btn-primary" id="tips-save-btn">保存</button>'
    + '</div>'
    + '</div></div></div>'
    + '<div class="tips-overlay" id="tips-std-overlay">'
    + '<div class="tips-std">'
    + '<div class="tips-std-head"><span class="tips-std-title" id="tips-std-title"></span><span class="tips-std-sub">tips/CONSTITUTION.md · 渲染</span><button class="tips-form-close" data-tips-close-std>x</button></div>'
    + '<div class="tips-std-body" id="tips-std-body"></div>'
    + '</div></div>';

  function injectOverlays() {
    var host = document.querySelector(sectionSel);
    if (host) host.classList.add('tips-panel-root');
    if ($('tips-form-overlay')) return;
    var div = document.createElement('div');
    div.innerHTML = OVERLAY_HTML;
    document.body.appendChild(div);
    if ($('tips-std-title')) $('tips-std-title').textContent = stdTitle;

    var typeSel = $('tips-tp-type');
    if (typeSel) typeSel.addEventListener('change', formTypeChange);

    var secFields = $('tips-sec-fields');
    if (secFields) secFields.addEventListener('input', function (e) {
      var ta = e.target;
      if (!ta.dataset || !ta.dataset.sec) return;
      state.sections.forEach(function (s) { if (s.slot === ta.dataset.sec) s.val = ta.value; });
    });

    var fo = $('tips-form-overlay');
    if (fo) {
      fo.addEventListener('click', function (e) {
        if (e.target === fo) closeForm();
        var t = e.target;
        if (t.closest && t.closest('[data-tips-close]')) closeForm();
        if (t.closest && t.closest('[data-tips-cancel]')) closeForm();
        if (t.closest && t.closest('[data-tips-std]')) openStd();
      });
    }
    var sb = $('tips-save-btn');
    if (sb) sb.addEventListener('click', save);

    var so = $('tips-std-overlay');
    if (so) so.addEventListener('click', function (e) {
      if (e.target === so || (e.target.closest && e.target.closest('[data-tips-close-std]'))) closeStd();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeForm(); closeStd(); }
    });
  }

  /* ── 面板控件绑定（宿主页提供 data-tip-open / data-tip-search） ── */
  function bindControls() {
    var openBtn = document.querySelector('[data-tip-open]');
    if (openBtn) openBtn.addEventListener('click', openForm);

    var search = document.querySelector('[data-tip-search]');
    if (search) {
      var timer;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.search = search.value.trim();
          renderGrid();
        }, 250);
      });
    }

    var dims = $('tipDimBlocks');
    if (dims) {
      dims.addEventListener('mouseover', function (e) {
        var opt = e.target.closest('.dim-opt');
        if (!opt) return;
        clearTimeout(_tipBubbleTimer);
        _tipBubbleTimer = setTimeout(function () { showBubble(opt); }, 200);
      });
      dims.addEventListener('mouseout', function (e) {
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.dim-opt')) return;
        hideBubble();
      });
      dims.addEventListener('click', function (e) {
        var opt = e.target.closest('.dim-opt');
        if (!opt) return;
        if (opt.hasAttribute('data-tipa')) state.authorFilter = opt.getAttribute('data-tipa');
        else if (opt.hasAttribute('data-tipd')) state.domainFilter = opt.getAttribute('data-tipd');
        else state.filter = opt.getAttribute('data-tipf');
        renderDims();
        renderGrid();
      });
    }

    var grid = $('tipGrid');
    if (grid) grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var f = b.getAttribute('data-file');
      if (!f) return;
      if (b.getAttribute('data-act') === 'edit') openEdit(f);
      else if (b.getAttribute('data-act') === 'del') del(f);
    });
  }

  function load() {
    fetch(api)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.data = normList(d);
        var nav = document.getElementById('navTipsCnt');
        if (nav) nav.textContent = state.data.length;
        renderDims();
        renderGrid();
      })
      .catch(function () { renderDims(); renderGrid(); });
  }

  function init() {
    injectOverlays();
    bindControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.TipsPanel = { load: load, renderMarkdown: renderMarkdown };
  window.md2html = function (src) { return renderMarkdown(src); };
})();
