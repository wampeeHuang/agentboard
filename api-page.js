// api-page.js — API reference page HTML generator
// used by server.js /api route (Accept: text/html)

module.exports = function apiHTML(data) {
  var jsonStr = JSON.stringify(data, null, 2);
  var esc = function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  var catDefs = [
    { id: 'all', label: '全部 All' },
    { id: '服务发现', label: '服务发现 Discovery' },
    { id: '工具管理', label: '工具管理 Tool Mgmt' }
  ];

  var epLabel = {};
  epLabel['GET /api'] = 'API 发现文档 / API discovery document';
  epLabel['GET /api/tools'] = '列出所有已注册工具及运行状态 / List registered tools with status';
  epLabel['POST /api/tools/start/:id'] = '按 ID 启动工具 / Start a tool by id';
  epLabel['POST /api/tools/stop/:id'] = '按 ID 停止工具 / Stop a tool by id';
  epLabel['POST /api/tools/reorder'] = '重排工具顺序 / Reorder tools';

  var epCurl = {};
  epCurl['GET /api'] = 'curl http://localhost:3099/api';
  epCurl['GET /api/tools'] = 'curl http://localhost:3099/api/tools';
  epCurl['POST /api/tools/start/:id'] = 'curl -X POST http://localhost:3099/api/tools/start/ace-step';
  epCurl['POST /api/tools/stop/:id'] = 'curl -X POST http://localhost:3099/api/tools/stop/ace-step';
  epCurl['POST /api/tools/reorder'] = 'curl -X POST http://localhost:3099/api/tools/reorder -H "Content-Type: application/json" -d \'{"items":[{"id":"ace-step","order":1}]}\'';

  var epBody = {};
  epBody['POST /api/tools/start/:id'] = '路径参数 / Path param: :id = 工具目录名 / tool directory name';
  epBody['POST /api/tools/stop/:id'] = '路径参数 / Path param: :id = 工具目录名 / tool directory name';
  epBody['POST /api/tools/reorder'] = 'JSON body: { "items": [{ "id": "tool-name", "order": 1 }, ...] }';

  var epCat = {};
  epCat['GET /api'] = '服务发现';
  epCat['GET /api/tools'] = '工具管理';
  epCat['POST /api/tools/start/:id'] = '工具管理';
  epCat['POST /api/tools/stop/:id'] = '工具管理';
  epCat['POST /api/tools/reorder'] = '工具管理';

  var cards = [];
  Object.keys(data.endpoints).forEach(function(k) {
    var method = k.split(' ')[0];
    var epPath = k.substring(method.length + 1);
    var cat = epCat[k] || '服务发现';
    var desc = epLabel[k] || data.endpoints[k];
    var curl = epCurl[k] || '';
    var body = epBody[k] || '';
    cards.push({ method: method, epPath: epPath, cat: cat, desc: desc, curl: curl, body: body });
  });

  var catCounts = {};
  catDefs.forEach(function(c) { catCounts[c.id] = 0; });
  cards.forEach(function(c) { catCounts[c.cat] = (catCounts[c.cat] || 0) + 1; });
  catCounts.all = cards.length;

  var catBar = '<div class="cat-bar" id="catBar">' +
    catDefs.map(function(c) {
      if (!catCounts[c.id] && c.id !== 'all') return '';
      return '<button class="cat-pill' + (c.id === 'all' ? ' active' : '') + '" data-cat="' + esc(c.id) + '" onclick="setApiFilter(\'' + esc(c.id) + '\')">' + esc(c.label) + '<span class="count">' + catCounts[c.id] + '</span></button>';
    }).join('') +
    '</div>';

  var cardHTML = cards.map(function(c, idx) {
    var curlEsc = esc(c.curl);
    var bodyBlock = c.body ? '<div class="ep-body">' + esc(c.body) + '</div>' : '';
    var epUrl = 'http://localhost:3099' + c.epPath;
    // GET: path is clickable link. POST: path is code, expand via + icon
    var pathHTML = c.method === 'GET'
      ? '<a class="ep-path ep-link" href="' + esc(epUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(c.epPath) + '</a>'
      : '<code class="ep-path">' + esc(c.epPath) + '</code>';

    return '<div class="card-wrap" data-cat="' + esc(c.cat) + '">' +
      '<div class="card ep-card" id="epCard' + idx + '">' +
        '<div class="ep-main">' +
          '<div class="ep-head">' +
            '<span class="method-badge method-' + c.method.toLowerCase() + '">' + esc(c.method) + '</span>' +
            pathHTML +
            '<span class="ep-expand-icon" onclick="event.stopPropagation();toggleEp(' + idx + ')" title="展开 curl 示例 / Expand curl">+</span>' +
          '</div>' +
          '<div class="ep-desc">' + esc(c.desc) + '</div>' +
          '<div class="card-cat-tag">' + esc(c.cat) + '</div>' +
        '</div>' +
        '<div class="ep-detail" id="epDetail' + idx + '">' +
          '<div class="ep-curl-label">cURL 示例 / Example</div>' +
          '<pre class="ep-curl">' + curlEsc + '</pre>' +
          bodyBlock +
          '<div class="ep-try">' +
            '<span class="ep-url-label">请求地址 / Request URL:</span>' +
            '<code class="ep-full-url">' + esc(epUrl) + '</code>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>API 控制面 / API Reference</title>\n' +
  '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">API</text></svg>') + '">\n' +
  '<style>\n' +
  '  *{margin:0;padding:0;box-sizing:border-box}\n' +
  '  body{font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FAFAF8;color:#0A0A0A;min-height:100vh;font-weight:300;font-size:16px}\n' +
  '  .hero{background:#002FA7;color:#FAFAF8;padding:56px 32px 48px}\n' +
  '  .hero-inner{max-width:1200px;margin:0 auto}\n' +
  '  .hero-mono{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
  '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
  '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:600px;letter-spacing:-0.01em}\n' +
  '  .hero .ver{font-size:11px;opacity:.4;margin-top:4px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace}\n' +
  '  .hero .truth-note{font-size:12px;opacity:.5;margin-top:10px;line-height:1.6;max-width:600px;font-weight:300;border-left:2px solid rgba(255,255,255,.3);padding-left:12px}\n' +
  '  .content{margin:0 auto;padding:24px 32px 48px}\n' +
  '  .cat-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}\n' +
  '  .cat-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #E0E0DC;border-radius:20px;background:#F8F8F4;color:#555;padding:6px 16px;font-size:13px;font-weight:400;cursor:pointer;font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;transition:all .15s;user-select:none;-webkit-user-select:none}\n' +
  '  .cat-pill:hover{border-color:#CCC;color:#0A0A0A;background:#EEE}\n' +
  '  .cat-pill.active{background:#002FA7;border-color:#002FA7;color:#FAFAF8}\n' +
  '  .cat-pill .count{font-size:11px;opacity:.6;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;min-width:16px;text-align:center}\n' +
  '  .cat-pill.active .count{opacity:.8}\n' +
  '  .card-grid{display:flex;flex-wrap:wrap;gap:12px}\n' +
  '  .card-wrap{flex:0 0 460px;position:relative;user-select:text;-webkit-user-select:text}\n' +
  '  .card-wrap.hidden-card{display:none}\n' +
  '  .card{background:#FAFAF8;border:1px solid #E0E0DC;padding:16px 20px;min-height:120px;display:flex;flex-direction:column;overflow:hidden;transition:border-color .15s,box-shadow .15s;position:relative}\n' +
  '  .card:hover{border-color:#CCC;box-shadow:0 2px 8px rgba(0,0,0,.04)}\n' +
  '  .ep-card .ep-main{display:flex;flex-direction:column;flex:1}\n' +
  '  .ep-card .ep-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}\n' +
  '  .method-badge{display:inline-block;width:52px;text-align:center;padding:2px 0;font-size:10px;font-weight:500;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;letter-spacing:.04em;flex-shrink:0}\n' +
  '  .method-get{background:#E3F2E5;color:#1B6B2E}\n' +
  '  .method-post{background:#FDE8C8;color:#8B5E14}\n' +
  '  .ep-path{font-size:13px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;color:#0A0A0A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}\n' +
  '  a.ep-link{color:#002FA7;text-decoration:none;cursor:pointer}\n' +
  '  a.ep-link:hover{text-decoration:underline}\n' +
  '  a.ep-link::after{content:" ↗";font-size:10px;color:#AAA}\n' +
  '  .ep-expand-icon{font-size:14px;color:#AAA;flex-shrink:0;width:20px;text-align:center;transition:transform .2s;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none}\n' +
  '  .ep-expand-icon:hover{color:#002FA7}\n' +
  '  .card.expanded .ep-expand-icon{transform:rotate(45deg);color:#002FA7}\n' +
  '  .ep-desc{font-size:12px;color:#888;line-height:1.6;flex:1;overflow:hidden;margin-bottom:6px}\n' +
  '  .card-cat-tag{font-size:10px;color:#AAA;border:1px solid #E8E8E4;padding:1px 8px;align-self:flex-start}\n' +
  '  .ep-detail{display:none;margin-top:12px;padding-top:12px;border-top:1px solid #E8E8E4}\n' +
  '  .card.expanded .ep-detail{display:block}\n' +
  '  .card.expanded{border-color:#002FA7}\n' +
  '  .ep-curl-label{font-size:10px;color:#999;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase}\n' +
  '  .ep-curl{background:#F4F4F0;padding:10px 14px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:11px;line-height:1.5;color:#555;overflow-x:auto;white-space:pre-wrap;word-break:break-all;user-select:text;-webkit-user-select:text;cursor:text}\n' +
  '  .ep-body{margin-top:8px;font-size:11px;color:#888;font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FFF8F0;padding:8px 12px;line-height:1.5}\n' +
  '  .ep-try{margin-top:8px;display:flex;align-items:center;gap:8px;font-size:11px;flex-wrap:wrap}\n' +
  '  .ep-url-label{color:#999;flex-shrink:0}\n' +
  '  .ep-full-url{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:11px;color:#002FA7;background:#F0F4FF;padding:2px 8px;user-select:text;-webkit-user-select:text;cursor:text}\n' +
  '  .section-bar{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-top:24px;border-top:1px solid #E0E0DC}\n' +
  '  .section-bar:first-of-type{border-top:none;padding-top:0}\n' +
  '  .section-bar h2{font-size:18px;font-weight:400;letter-spacing:-0.01em;border:none;padding:0;margin:0}\n' +
  '  .section-bar .section-count{font-size:12px;color:#999;font-family:"JetBrains Mono","SF Mono","Consolas",monospace}\n' +
  '  .footer{max-width:1200px;margin:0 auto;padding:24px 32px;border-top:1px solid #E0E0DC;font-size:12px;color:#999;display:flex;justify-content:space-between}\n' +
  '  .footer a{color:#002FA7;text-decoration:none}\n' +
  '</style>\n</head>\n<body>\n' +
  '<div class="hero"><div class="hero-inner">\n' +
  '  <a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;opacity:.5;letter-spacing:.04em">← 工具架 Dashboard</a>\n' +
  '  <div class="hero-mono" style="margin-top:10px">API 控制面 / API REFERENCE</div>\n' +
  '  <h1>HTTP API 端点参考 / Endpoint Reference</h1>\n' +
  '  <div class="tagline">Agentboard JSON API — ' + cards.length + ' 个端点，返回 JSON / ' + cards.length + ' JSON endpoints — GET 端点可点击直达</div>\n' +
  '  <div class="ver">v' + esc(data.version) + '</div>\n' +
  '  <div class="truth-note">唯一真相源 / Single source of truth — 工具状态由 <code>~/.agentboard/tools/*/manifest.json</code> 定义。操作记录见 <a href="/tips" style="color:inherit;text-decoration:underline">/tips</a>。</div>\n' +
  '</div></div>\n' +
  '<div class="content">\n' +
  '  <div class="section-bar"><h2>全部端点 All Endpoints</h2><span class="section-count">' + cards.length + ' 个</span></div>\n' +
  '  ' + catBar + '\n' +
  '  <div class="card-grid" id="cardGrid">' + cardHTML + '</div>\n' +
  '  <details style="margin-top:32px;padding-top:20px;border-top:1px solid #E0E0DC">\n' +
  '    <summary style="font-size:13px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;color:#888;cursor:pointer">查看原始 JSON / Raw JSON (AI 可直接解析)</summary>\n' +
  '    <pre style="background:#F4F4F0;padding:16px 20px;margin-top:8px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;font-size:11px;line-height:1.6;overflow-x:auto;color:#555">' + esc(jsonStr) + '</pre>\n' +
  '  </details>\n' +
  '</div>\n' +
  '<div class="footer"><span>curl http://localhost:3099/api | jq</span><a href="/api">GET /api</a></div>\n' +
  '<script>\n' +
  'var apiFilter="all";\n' +
  'var expandedIdx=-1;\n' +
  'function setApiFilter(t){\n' +
  '  apiFilter=t;\n' +
  '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});\n' +
  '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.cat===apiFilter)p.classList.add("active");});\n' +
  '  document.querySelectorAll(".card-wrap").forEach(function(c){\n' +
  '    if(apiFilter==="all"||c.dataset.cat===apiFilter){c.classList.remove("hidden-card");}\n' +
  '    else{c.classList.add("hidden-card");}\n' +
  '  });\n' +
  '}\n' +
  'function toggleEp(idx){\n' +
  '  var card=document.getElementById("epCard"+idx);\n' +
  '  if(!card)return;\n' +
  '  if(expandedIdx>=0&&expandedIdx!==idx){\n' +
  '    var prev=document.getElementById("epCard"+expandedIdx);\n' +
  '    if(prev)prev.classList.remove("expanded");\n' +
  '  }\n' +
  '  if(card.classList.contains("expanded")){\n' +
  '    card.classList.remove("expanded");\n' +
  '    expandedIdx=-1;\n' +
  '  }else{\n' +
  '    card.classList.add("expanded");\n' +
  '    expandedIdx=idx;\n' +
  '  }\n' +
  '}\n' +
  '</script>\n' +
  '</body>\n</html>';
};
