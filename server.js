const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');

const PROJECT_DIR = __dirname;
const TOOLS_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(os.homedir(), '.claude', 'tools');
const SKILLS_DIR = process.env.AGENTBOARD_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
const TIPS_DIR = process.env.AGENTBOARD_TIPS_DIR || path.join(os.homedir(), '.claude', 'tips');
const LOCAL_TOOLS_DIR = path.join(PROJECT_DIR, 'tools');
const LOCAL_SKILLS_DIR = path.join(PROJECT_DIR, 'skills');
const PREFERRED_PORT = parseInt(process.env.PORT || '3099', 10);
const PLATFORM = process.platform;

function read(p) { try { return fs.readFileSync(p,'utf8'); } catch(_) { return null; } }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function listDirs(p) { try { return fs.readdirSync(p,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name); } catch(_) { return []; } }

function safeResolve(base, ...segments) {
  const resolved = path.resolve(path.join(base, ...segments));
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    return null;
  }
  return resolved;
}

// Normalize MSYS2 paths (/d/foo → D:\foo) for Node fs on Windows
function winPath(p) {
  const m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}

function scanSkillDiagrams() {
  var seen = {};
  var diagrams = [];
  [LOCAL_SKILLS_DIR, SKILLS_DIR].forEach(function(dir) {
    if (!fs.existsSync(dir)) return;
    listDirs(dir).forEach(function(name) {
      if (seen[name]) return;
      var filePath = path.join(dir, name, 'references', 'system-diagram.html');
      var html = read(filePath);
      if (!html) return;
      seen[name] = true;
      var h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      var deckM = html.match(/<p\s+class="deck"[^>]*>([\s\S]*?)<\/p>/i);
      var rawH1 = h1M ? h1M[1].replace(/<[^>]*>/g, '').trim() : '';
      var deck = deckM ? deckM[1].trim() : '';
      var kpiRe = /<div class="kv">([^<]*)<\/div>\s*<div class="kl">([^<]*)<\/div>/g;
      var kpis = [];
      var m;
      while ((m = kpiRe.exec(html)) !== null) kpis.push({ v: m[1], l: m[2] });

      // heading = English/tech name, displayName = Chinese label
      var heading = rawH1 || name;
      var displayName = '';
      if (/[一-鿿]/.test(rawH1)) {
        // h1 IS Chinese — use it as displayName, fall back to dir name for heading
        displayName = rawH1;
        heading = name;
      }

      // If no Chinese displayName yet, try SKILL.md
      if (!displayName) {
        var skillMd = read(path.join(dir, name, 'SKILL.md'));
        if (skillMd) {
          // Try h1 for displayName
          var zhH1 = skillMd.match(/^#\s+(.+)/m);
          if (zhH1 && /[一-鿿]/.test(zhH1[1])) {
            var h = zhH1[1].trim();
            var emDash = h.indexOf(' — ');
            displayName = emDash > 0 ? h.substring(emDash + 3).trim() : h;
          }
          // If deck has no Chinese, try to extract from SKILL.md body
          if (!deck || !/[一-鿿]/.test(deck)) {
            var lines = skillMd.split('\n');
            var past = false;
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (line.startsWith('# ')) { past = true; continue; }
              if (!past || !line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('---')) continue;
              if (!/[一-鿿]/.test(line) || line.length < 10) continue;
              deck = line.replace(/[*_`\[\]]/g, '').substring(0, 120);
              break;
            }
          }
        }
      }

      var words = name.split(/[-_]/).filter(function(w) { return w.length > 0; });
      var mono = words.length >= 2
        ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
      diagrams.push({
        name: name,
        heading: heading,
        displayName: displayName,
        deck: deck,
        kpis: kpis,
        mono: mono,
        filePath: 'skills/' + name + '/references/system-diagram.html'
      });
    });
  });
  return diagrams;
}

function extractMeta(projectPath) {
  const html = read(path.join(winPath(projectPath), 'index.html'));
  if (!html) return {};
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  const desc = html.match(/<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([^"']*)["']/i);
  return {
    _name: title ? title[1].trim() : null,
    _desc: desc ? desc[1].trim() : null
  };
}

function scanTools() {
  var seen = {};
  var tools = [];
  // Scan both repo's ./tools/ (demo) and user's ~/.claude/tools/
  [LOCAL_TOOLS_DIR, TOOLS_DIR].forEach(function(dir) {
    if (!fs.existsSync(dir)) return;
    var names = listDirs(dir);
    names.forEach(function(name) {
      if (seen[name]) return;
      var mfPath = path.join(dir, name, 'manifest.json');
      var mf;
      try { mf = JSON.parse(read(mfPath)); } catch(_) { return; }
      if (!mf || !mf.name) return;
      seen[name] = true;
      if (mf.projectPath) {
        var meta = extractMeta(mf.projectPath);
        if (!mf.name && meta._name) mf.name = meta._name;
        if (!mf.description && meta._desc) mf.description = meta._desc;
      }
      var ports = mf.ports || (mf.port ? [mf.port] : []);
      var running = ports.length > 0 ? ports.every(function(p) { return isPortActive(p); }) : null;
      tools.push({ name: mf.name, id: name, description: mf.description || '', icon: mf.icon || '', version: mf.version || '', category: mf.category, order: mf.order, port: mf.port, ports: mf.ports, url: mf.url, running: running, startCommand: mf.startCommand, stopCommand: mf.stopCommand, projectPath: mf.projectPath, publicUrl: mf.publicUrl, conflicts: [] });
    });
  });

  // Detect port conflicts between registered tools
  tools.forEach(function(t) {
    var myPorts = t.ports || (t.port ? [t.port] : []);
    tools.forEach(function(other) {
      if (other.id === t.id) return;
      var otherPorts = other.ports || (other.port ? [other.port] : []);
      myPorts.forEach(function(p) {
        if (otherPorts.indexOf(p) !== -1) {
          t.conflicts.push({ toolId: other.id, toolName: other.name, port: p });
        }
      });
    });
  });

  tools.sort(function(a, b) { return (a.order != null ? a.order : 99) - (b.order != null ? b.order : 99) || a.name.localeCompare(b.name, 'zh-CN'); });
  return tools;
}

function isPortActive(port) {
  try {
    let cmd;
    let out;
    if (PLATFORM === 'win32') {
      out = execSync('netstat -ano', { timeout: 3000, encoding: 'utf8', shell: true, windowsHide: true });
      var tcpRe = new RegExp('\\s+TCP\\s+\\S+:' + port + '\\s+.*LISTENING', 'i');
      var udpRe = new RegExp('\\s+UDP\\s+\\S+:' + port + '\\s+', 'i');
      return tcpRe.test(out) || udpRe.test(out);
    } else if (PLATFORM === 'darwin') {
      out = execSync('lsof -i :' + port + ' -sTCP:LISTEN -t 2>/dev/null', { timeout: 2000, encoding: 'utf8', shell: true });
      return out.trim().length > 0;
    } else {
      out = execSync('ss -tlnp 2>/dev/null | grep -q ":' + port + ' "', { timeout: 2000, encoding: 'utf8', shell: true });
      return out.trim().length > 0;
    }
  } catch(_) { return false; }
}

function startTool(id) {
  const mfPath = safeResolve(TOOLS_DIR, id, 'manifest.json');
  if (!mfPath) return { ok: false, error: 'forbidden' };
  let mf;
  try { mf = JSON.parse(read(mfPath)); } catch(_) { return { ok: false, error: 'manifest not found' }; }
  if (!mf.startCommand) return { ok: false, error: 'no startCommand' };

  // Check port conflicts: are any of this tool's ports already in use by another RUNNING tool?
  const myPorts = mf.ports || (mf.port ? [mf.port] : []);
  if (myPorts.length > 0) {
    const allTools = scanTools();
    const conflicts = [];
    allTools.forEach(function(t) {
      if (t.id === id) return;
      if (!t.running) return;
      var tp = t.ports || (t.port ? [t.port] : []);
      myPorts.forEach(function(p) {
        if (tp.indexOf(p) !== -1) conflicts.push(t.name + '(:' + p + ')');
      });
    });
    if (conflicts.length > 0) return { ok: false, error: 'Port conflict: ' + conflicts.join(', ') + ' already using these ports' };
  }
  try {
    const cwd = mf.projectPath ? winPath(mf.projectPath) : PROJECT_DIR;
    let child;
    if (PLATFORM === 'win32') {
      child = spawn('cmd', ['/c', mf.startCommand], { cwd, detached: true, stdio: 'ignore', shell: true });
    } else {
      child = spawn(mf.startCommand, { cwd, detached: true, stdio: 'ignore', shell: true });
    }
    child.unref();
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

function stopTool(id, callback) {
  const mfPath = safeResolve(TOOLS_DIR, id, 'manifest.json');
  if (!mfPath) return callback(null, { ok: false, error: 'forbidden' });
  let mf;
  try { mf = JSON.parse(read(mfPath)); } catch(_) { return callback(null, { ok: false, error: 'manifest not found' }); }
  if (!mf.stopCommand) return callback(null, { ok: false, error: 'no stopCommand' });
  exec(mf.stopCommand, { timeout: 10000, encoding: 'utf8' }, function(err) {
    if (err) return callback(null, { ok: false, error: err.message });
    callback(null, { ok: true });
  });
}

function skillIndexHTML(diagrams) {
  const list = diagrams.map(function(d) {
    var kpiTags = d.kpis.map(function(k) {
      return '<span class="kpi"><b>' + k.v + '</b> ' + k.l + '</span>';
    }).join('');
    return '<div class="card-wrap" data-skill="' + d.name + '">' +
      '<a href="/skills/' + d.name + '" target="_blank" class="card">' +
        '<span class="card-grip" draggable="true">⋮⋮</span>' +
        '<div class="card-mono">' + d.mono + '</div>' +
        '<div class="card-body">' +
          '<div class="card-name">' + esc(d.heading) + '</div>' +
          (d.displayName ? '<div class="card-cn">' + esc(d.displayName) + '</div>' : '') +
          (d.deck ? '<div class="card-deck">' + esc(d.deck) + '</div>' : '') +
          (kpiTags ? '<div class="card-kpis">' + kpiTags + '</div>' : '') +
          '<div class="card-path">' + d.filePath + '</div>' +
        '</div>' +
      '</a>' +
    '</div>';
  }).join('\n');

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Skill 系统结构图</title>\n' +
'<link rel="icon" href="data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">SK</text></svg>') +
'">\n' +
'<style>\n' +
'  *{margin:0;padding:0;box-sizing:border-box}\n' +
'  body{font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FAFAF8;color:#0A0A0A;min-height:100vh;font-weight:300;font-size:16px}\n' +
'  .hero{background:#002FA7;color:#FAFAF8;padding:56px 32px 48px}\n' +
'  .hero-inner{max-width:1080px;margin:0 auto}\n' +
'  .hero-mono{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
'  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
'  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:520px;letter-spacing:-0.01em}\n' +
'  .hero .hero-sub{font-size:13px;font-weight:300;opacity:.5;margin-top:6px;line-height:1.5}\n' +
'  .hero .hint{font-size:11px;opacity:.45;margin-top:6px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace}\n' +
'  .hero .refresh-btn{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:8px 18px;font-size:13px;font-weight:500;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;color:#002FA7;background:#fff;border:1px solid #fff;cursor:pointer;letter-spacing:.04em;transition:background .15s}\n' +
'  .hero .refresh-btn:hover{background:#E8E8F0;border-color:#E8E8F0}\n' +
'  .content{max-width:1080px;margin:0 auto;padding:6px 32px 32px}\n' +
'  .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start}\n' +
'  .card-wrap{flex:1 1 340px;max-width:420px;min-width:280px;position:relative;user-select:text;-webkit-user-select:text}\n' +
'  .card-wrap.dragging{opacity:.35}\n' +
'  .card-wrap.drag-over::before{content:"";position:absolute;inset:0;border:2px solid #002FA7;z-index:2;pointer-events:none}\n' +
'  .card{display:flex;align-items:flex-start;gap:28px;background:#FAFAF8;padding:22px 28px;text-decoration:none;color:inherit;transition:background .15s,box-shadow .15s;height:220px;user-select:text;-webkit-user-select:text;overflow:hidden;border:1px solid #E0E0DC;box-shadow:0 1px 3px rgba(0,0,0,.06);position:relative}\n' +
'  .card-grip{position:absolute;top:12px;right:12px;color:#B0B0AC;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none}\n' +
'  .card-grip:active{cursor:grabbing}\n' +
'  .card:hover{background:#F0F0EC}\n' +
'  .card-mono{flex-shrink:0;width:52px;height:52px;background:#002FA7;color:#FAFAF8;display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
'  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0}\n' +
'  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em;word-break:break-all}\n' +
'  .card-cn{font-size:15px;font-weight:300;color:#002FA7;opacity:.7;letter-spacing:-0.01em}\n' +
'  .card-deck{font-size:13px;font-weight:300;color:#555;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
'  .card-kpis{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}\n' +
'  .kpi{font-size:11px;font-weight:300;color:#737373;background:#F2F2F0;padding:3px 8px;letter-spacing:.01em}\n' +
'  .kpi b{font-weight:500;color:#0A0A0A}\n' +
'  .card-path{font-size:11px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;color:#B0B0AC;margin-top:2px;word-break:break-all}\n' +
'  .footer{max-width:1080px;width:100%;margin:0 auto;padding:36px 32px;border-top:1px solid #E0E0DC}\n' +
'  .phil-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:#E0E0DC;margin-bottom:32px}\n' +
'  .phil-card{background:#FAFAF8;padding:24px 20px}\n' +
'  .phil-num{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;color:#002FA7;opacity:.45;margin-bottom:10px;letter-spacing:.04em}\n' +
'  .phil-title{font-size:15px;font-weight:500;color:#0A0A0A;margin-bottom:6px;letter-spacing:-0.01em;line-height:1.4}\n' +
'  .phil-body{font-size:12px;font-weight:300;color:#555;line-height:1.6}\n' +
'  .phil-body strong{font-weight:500;color:#0A0A0A}\n' +
'  .footer-bottom{margin-top:0;padding-top:18px;border-top:1px solid #E0E0DC;font-size:11px;color:#999;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;display:flex;align-items:center;justify-content:space-between}\n' +
'</style>\n</head>\n<body>\n' +
'<!-- AI AGENT: 模板 ~/.claude/skills/system-diagram/template.html  规则 ~/.claude/skills/system-diagram/schema.md  输出 <skill-dir>/references/system-diagram.html  触发=用户显式请求(发本页URL/说"加图"/"更新结构图")。非自动——不是所有skill都要HTML图  流程=读SKILL.md→加载模板→按schema.md填充→写图  -->\n' +
'<div class="hero">\n  <div class="hero-inner">\n    <a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a>\n    <div class="hero-mono" style="margin-top:10px">SKILL DIAGRAMS</div>\n    <h1>Skill 系统结构图</h1>\n    <div class="tagline">图是 skill 的第一行代码。新建或修改 Skill 时，把本页链接发给 Agent，它会自动生成结构图。</div>\n    <div class="hero-sub">' + diagrams.length + ' 个 skill · Swiss International Style · 每次请求实时扫描，新增图落盘即现</div>\n    <p class="hint">拖拽 ⋮⋮ 排序 · 点击卡片打开 · 文字可直接选中复制</p>\n    <button class="refresh-btn" id="refreshBtn" onclick="refreshSkills()">⟳ 刷新扫描</button>\n  </div>\n</div>\n' +
'<div class="content"><div class="grid">' + list + '</div></div>\n' +
'<div class="footer">\n' +
'  <div class="phil-grid">\n' +
'    <div class="phil-card">\n' +
'      <div class="phil-num">01</div>\n' +
'      <div class="phil-title">图乱 = 设计乱</div>\n' +
'      <div class="phil-body">结构图画不清楚的 skill，prompt 链路一定也糊。HTML 图是<strong>设计的第一份可执行规范</strong>。</div>\n' +
'    </div>\n' +
'    <div class="phil-card">\n' +
'      <div class="phil-num">02</div>\n' +
'      <div class="phil-title">Karpathy 循环</div>\n' +
'      <div class="phil-body"><strong>可视化 → 暴露问题 → 改源头 → 更新图。</strong>不是写完代码再补图。图是侦探工具，图和代码永远同步。</div>\n' +
'    </div>\n' +
'    <div class="phil-card">\n' +
'      <div class="phil-num">03</div>\n' +
'      <div class="phil-title">HTML 即结构校验器</div>\n' +
'      <div class="phil-body">传统文档写完就过时。HTML 结构图是<strong>活的</strong>——新增 skill 落盘即现，改图刷新即见。</div>\n' +
'    </div>\n' +
'    <div class="phil-card">\n' +
'      <div class="phil-num">04</div>\n' +
'      <div class="phil-title">Agent 也能读</div>\n' +
'      <div class="phil-body">system-diagram.html = skill 的<strong>自述文件</strong>。Agent 打开就能理解架构和数据流。不做第二个 README，做唯一的结构真相源。</div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="footer-bottom">\n' +
'    <span>扫描目录：' + SKILLS_DIR.replace(/\\/g, '\\\\') + '\\*\\references\\system-diagram.html</span>\n' +
'  </div>\n' +
'</div>\n' +
'<script>\n' +
'function refreshSkills(){\n' +
'  var btn=document.getElementById("refreshBtn");\n' +
'  if(!btn)return;\n' +
'  btn.textContent="⟳ 刷新中…";\n' +
'  btn.disabled=true;\n' +
'  btn.style.opacity="0.5";\n' +
'  btn.style.cursor="wait";\n' +
'  setTimeout(function(){location.reload(true);},250);\n' +
'}\n' +
'(function(){\n' +
'  var grid=document.querySelector(".grid");\n' +
'  var dragSrc=null;\n' +
'  var KEY="skill-diagrams-order";\n' +
'\n' +
'  // Restore saved order on load\n' +
'  var saved=null;\n' +
'  try{saved=JSON.parse(localStorage[KEY]||"[]");}catch(e){}\n' +
'  if(saved&&saved.length){\n' +
'    var cards=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
'    cards.sort(function(a,b){\n' +
'      var ai=saved.indexOf(a.dataset.skill);\n' +
'      var bi=saved.indexOf(b.dataset.skill);\n' +
'      if(ai===-1)return 1;if(bi===-1)return -1;\n' +
'      return ai-bi;\n' +
'    });\n' +
'    cards.forEach(function(c){grid.appendChild(c);});\n' +
'  }\n' +
'\n' +
'  function saveOrder(){\n' +
'    var order=[].slice.call(grid.querySelectorAll(".card-wrap")).map(function(c){return c.dataset.skill;});\n' +
'    try{localStorage[KEY]=JSON.stringify(order);}catch(e){}\n' +
'  }\n' +
'\n' +
'  grid.addEventListener("dragstart",function(e){\n' +
'    if(!e.target.classList.contains("card-grip")){e.preventDefault();return;}\n' +
'    var wrap=e.target.closest(".card-wrap");\n' +
'    if(!wrap)return;\n' +
'    dragSrc=wrap;\n' +
'    wrap.classList.add("dragging");\n' +
'    e.dataTransfer.effectAllowed="move";\n' +
'  });\n' +
'\n' +
'  grid.addEventListener("dragend",function(e){\n' +
'    var wrap=e.target.closest(".card-wrap");\n' +
'    if(wrap)wrap.classList.remove("dragging");\n' +
'    dragSrc=null;\n' +
'    [].slice.call(grid.querySelectorAll(".drag-over")).forEach(function(c){c.classList.remove("drag-over");});\n' +
'  });\n' +
'\n' +
'  grid.addEventListener("dragover",function(e){\n' +
'    e.preventDefault();\n' +
'    var wrap=e.target.closest(".card-wrap");\n' +
'    if(!wrap||wrap===dragSrc)return;\n' +
'    e.dataTransfer.dropEffect="move";\n' +
'    wrap.classList.add("drag-over");\n' +
'  });\n' +
'\n' +
'  grid.addEventListener("dragleave",function(e){\n' +
'    var wrap=e.target.closest(".card-wrap");\n' +
'    if(wrap)wrap.classList.remove("drag-over");\n' +
'  });\n' +
'\n' +
'  grid.addEventListener("drop",function(e){\n' +
'    e.preventDefault();\n' +
'    var wrap=e.target.closest(".card-wrap");\n' +
'    if(!wrap||wrap===dragSrc)return;\n' +
'    wrap.classList.remove("drag-over");\n' +
'    var children=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
'    var si=children.indexOf(dragSrc);\n' +
'    var di=children.indexOf(wrap);\n' +
'    if(si<di){grid.insertBefore(dragSrc,wrap.nextSibling);}\n' +
'    else{grid.insertBefore(dragSrc,wrap);}\n' +
'    saveOrder();\n' +
'  });\n' +
'\n' +
'  // Prevent link nav when selecting text\n' +
'  document.querySelectorAll(".card").forEach(function(card){\n' +
'    var sel=false;\n' +
'    card.addEventListener("mousedown",function(){sel=false;});\n' +
'    card.addEventListener("mousemove",function(){sel=!!window.getSelection().toString();});\n' +
'    card.addEventListener("click",function(e){if(sel){e.preventDefault();e.stopPropagation();sel=false;}});\n' +
'  });\n' +
'})();\n' +
'</script>\n' +
'</body>\n</html>';
}

function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api', function(req, res) {
    res.json({
      name: 'Agentboard',
      version: '1.0.0',
      description: 'Filesystem-as-registry toolchain control plane for AI agents',
      endpoints: {
        'GET /api': 'This discovery document',
        'GET /api/tools': 'List all registered tools with running status',
        'POST /api/tools/start/:id': 'Start a tool by id',
        'POST /api/tools/stop/:id': 'Stop a tool by id',
        'POST /api/tools/reorder': 'Reorder tools (body: {items: [{id, order}]})',
        'GET /skills': 'Skill system diagrams gallery (auto-scanned from filesystem)',
        'GET /skills/:name': 'Serve individual skill system-diagram.html'
      },
      manifestSchema: {
        id: 'string — directory name under TOOLS_DIR',
        name: 'string — display name',
        description: 'string',
        icon: 'string — emoji or single character',
        version: 'string',
        category: 'string — 基础设施 | 内容 | 开发 | AIGC | AI 模型 | 其他',
        order: 'number — sort order (default 99, lower = first)',
        port: 'number — single port (use port or ports, not both)',
        ports: 'number[] — multiple ports',
        projectPath: 'string — working directory for startCommand',
        url: 'string — browser URL when running',
        startCommand: 'string — shell command to start',
        stopCommand: 'string — shell command to stop'
      },
      toolsDir: TOOLS_DIR,
      skillsDir: SKILLS_DIR
    });
  });

  if (fs.existsSync(LOCAL_SKILLS_DIR) || fs.existsSync(SKILLS_DIR)) {
    app.get('/skills', function(req, res) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      var diagrams = scanSkillDiagrams();
      res.send(skillIndexHTML(diagrams));
    });

    app.get('/skills/:name', function(req, res) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      var filePath = safeResolve(LOCAL_SKILLS_DIR, req.params.name, 'references', 'system-diagram.html');
      if (filePath) {
        var html = read(filePath);
        if (html) return res.send(html);
      }
      filePath = safeResolve(SKILLS_DIR, req.params.name, 'references', 'system-diagram.html');
      if (!filePath) return res.status(403).send('forbidden');
      var html2 = read(filePath);
      if (!html2) return res.status(404).send('diagram not found');
      res.send(html2);
    });
  }

  // Tips (踩坑经验)
  if (fs.existsSync(TIPS_DIR)) {
    function parseTipFile(filePath) {
      var md = read(filePath);
      if (!md) return null;
      var h1 = md.match(/^#\s+(.+)/m);
      var title = h1 ? h1[1] : path.basename(filePath, '.md');

      // Extract description: frontmatter > first non-heading paragraph > first ## heading
      var desc = '';
      var fmMatch = md.match(/^description:\s*(.+)/m);
      if (fmMatch) {
        desc = fmMatch[1];
      } else {
        // Find first meaningful text line after # title, before any ## heading
        var lines = md.split('\n');
        var pastTitle = false;
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.startsWith('# ') && !pastTitle) { pastTitle = true; continue; }
          if (!pastTitle) continue;
          if (!line || line.startsWith('#') || line.startsWith('>') || line.startsWith('```') || line.startsWith('---')) continue;
          if (line.startsWith('- ') || line.length < 10) continue;
          // Skip code/English-only lines: require at least one CJK char
          if (!/[一-鿿]/.test(line)) continue;
          if (/[()]/.test(line) && !/[一-鿿]/.test(line)) continue;
          desc = line.replace(/[*_`]/g, '').substring(0, 80);
          break;
        }
      }
      if (!desc) {
        var h2m = md.match(/^##\s+(.+)/m);
        desc = h2m ? h2m[1] : '';
      }

      return { title: title, desc: desc, body: md };
    }

    function renderMarkdown(md) {
      var body = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Remove the h1 line (title is shown separately)
      body = body.replace(/^#\s+.*\n/, '');
      // Code blocks
      body = body.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        return '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>';
      });
      // Inline code
      body = body.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Bold
      body = body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic
      body = body.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Links
      body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      // Headings
      body = body.replace(/^### (.+)/gm, '<h3>$1</h3>');
      body = body.replace(/^## (.+)/gm, '<h2>$1</h2>');
      // Unordered list items
      body = body.replace(/^- (.+)/gm, '<li>$1</li>');
      // Wrap consecutive <li> in <ul>
      body = body.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
      // Paragraphs: wrap non-empty, non-tag lines
      body = body.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
      // Clean up empty <p>
      body = body.replace(/<p>\s*<\/p>/g, '');
      return body;
    }

    app.get('/tips', function(req, res) {
      var files = fs.readdirSync(TIPS_DIR).filter(function(f) { return f.endsWith('.md'); }).sort();
      var items = files.map(function(f) {
        var tip = parseTipFile(path.join(TIPS_DIR, f));
        return tip ? { file: f, title: tip.title, desc: tip.desc } : null;
      }).filter(Boolean);

      var cardsHtml = items.map(function(item) {
        var words = item.title.replace(/[^一-鿿a-zA-Z]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 0; });
        var mono = words.length >= 2
          ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
          : item.title.substring(0, 2).toUpperCase();
        return '<div class="card-wrap" data-tip="' + item.file + '">' +
          '<a href="/tips/' + encodeURIComponent(item.file) + '" target="_blank" class="card">' +
            '<span class="card-grip" draggable="true">⋮⋮</span>' +
            '<div class="card-mono">' + esc(mono) + '</div>' +
            '<div class="card-body">' +
              '<div class="card-name">' + esc(item.title) + '</div>' +
              (item.desc ? '<div class="card-sub">' + esc(item.desc) + '</div>' : '') +
            '</div>' +
          '</a>' +
        '</div>';
      }).join('\n');

      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>踩坑经验 · Tips</title>\n' +
        '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">TP</text></svg>') + '">\n' +
        '<style>\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FAFAF8;color:#0A0A0A;min-height:100vh;font-weight:300;font-size:16px}\n' +
        '  .hero{background:#002FA7;color:#FAFAF8;padding:56px 32px 48px}\n' +
        '  .hero-inner{max-width:1080px;margin:0 auto}\n' +
        '  .hero-mono{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
        '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
        '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6}\n' +
        '  .content{max-width:1080px;margin:0 auto;padding:6px 32px 32px}\n' +
        '  .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start}\n' +
        '  .card-wrap{flex:1 1 340px;max-width:420px;min-width:280px;position:relative;user-select:text;-webkit-user-select:text}\n' +
        '  .card-wrap.dragging{opacity:.35}\n' +
        '  .card-wrap.drag-over::before{content:"";position:absolute;inset:0;border:2px solid #002FA7;z-index:2;pointer-events:none}\n' +
        '  .card{display:flex;align-items:flex-start;gap:28px;background:#FAFAF8;padding:22px 28px;text-decoration:none;color:inherit;transition:background .15s,box-shadow .15s;height:160px;overflow:hidden;border:1px solid #E0E0DC;box-shadow:0 1px 3px rgba(0,0,0,.06);position:relative}\n' +
        '  .card:hover{background:#F0F0EC}\n' +
        '  .card-grip{position:absolute;top:12px;right:12px;color:#B0B0AC;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1}\n' +
        '  .card-grip:active{cursor:grabbing}\n' +
        '  .card-mono{flex-shrink:0;width:52px;height:52px;background:#002FA7;color:#FAFAF8;display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
        '  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0}\n' +
        '  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em}\n' +
        '  .card-sub{font-size:13px;font-weight:300;color:#555;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a><div class="hero-mono" style="margin-top:10px">TIPS & PITFALLS</div><h1>踩坑经验</h1><div class="tagline">人+AI 共享操作笔记 · ' + items.length + ' 条</div></div></div>\n' +
        '<div class="content"><div class="grid">' + cardsHtml + '</div></div>\n' +
        '<script>\n' +
        '(function(){\n' +
        '  var grid=document.querySelector(".grid");\n' +
        '  var dragSrc=null;\n' +
        '  var KEY="tips-order";\n' +
        '  var saved=null;\n' +
        '  try{saved=JSON.parse(localStorage[KEY]||"[]");}catch(e){}\n' +
        '  if(saved&&saved.length){\n' +
        '    var cards=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
        '    cards.sort(function(a,b){\n' +
        '      var ai=saved.indexOf(a.dataset.tip);\n' +
        '      var bi=saved.indexOf(b.dataset.tip);\n' +
        '      if(ai===-1)return 1;if(bi===-1)return -1;\n' +
        '      return ai-bi;\n' +
        '    });\n' +
        '    cards.forEach(function(c){grid.appendChild(c);});\n' +
        '  }\n' +
        '  function saveOrder(){\n' +
        '    var order=[].slice.call(grid.querySelectorAll(".card-wrap")).map(function(c){return c.dataset.tip;});\n' +
        '    try{localStorage[KEY]=JSON.stringify(order);}catch(e){}\n' +
        '  }\n' +
        '  grid.addEventListener("dragstart",function(e){\n' +
        '    if(!e.target.classList.contains("card-grip")){e.preventDefault();return;}\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap)return;\n' +
        '    dragSrc=wrap;\n' +
        '    wrap.classList.add("dragging");\n' +
        '    e.dataTransfer.effectAllowed="move";\n' +
        '  });\n' +
        '  grid.addEventListener("dragend",function(e){\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(wrap)wrap.classList.remove("dragging");\n' +
        '    dragSrc=null;\n' +
        '    [].slice.call(grid.querySelectorAll(".drag-over")).forEach(function(c){c.classList.remove("drag-over");});\n' +
        '  });\n' +
        '  grid.addEventListener("dragover",function(e){\n' +
        '    e.preventDefault();\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap||wrap===dragSrc)return;\n' +
        '    e.dataTransfer.dropEffect="move";\n' +
        '    wrap.classList.add("drag-over");\n' +
        '  });\n' +
        '  grid.addEventListener("dragleave",function(e){\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(wrap)wrap.classList.remove("drag-over");\n' +
        '  });\n' +
        '  grid.addEventListener("drop",function(e){\n' +
        '    e.preventDefault();\n' +
        '    var wrap=e.target.closest(".card-wrap");\n' +
        '    if(!wrap||wrap===dragSrc)return;\n' +
        '    wrap.classList.remove("drag-over");\n' +
        '    var children=[].slice.call(grid.querySelectorAll(".card-wrap"));\n' +
        '    var si=children.indexOf(dragSrc);\n' +
        '    var di=children.indexOf(wrap);\n' +
        '    if(si<di){grid.insertBefore(dragSrc,wrap.nextSibling);}\n' +
        '    else{grid.insertBefore(dragSrc,wrap);}\n' +
        '    saveOrder();\n' +
        '  });\n' +
        '  document.querySelectorAll(".card").forEach(function(card){\n' +
        '    var sel=false;\n' +
        '    card.addEventListener("mousedown",function(){sel=false;});\n' +
        '    card.addEventListener("mousemove",function(){sel=!!window.getSelection().toString();});\n' +
        '    card.addEventListener("click",function(e){if(sel){e.preventDefault();e.stopPropagation();sel=false;}});\n' +
        '  });\n' +
        '})();\n' +
        '</script>\n</body>\n</html>';
      res.send(html);
    });

    app.get('/tips/:name', function(req, res) {
      var filePath = safeResolve(TIPS_DIR, req.params.name);
      if (!filePath) return res.status(403).send('forbidden');
      var tip = parseTipFile(filePath);
      if (!tip) return res.status(404).send('tip not found');

      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + tip.title + ' · Tips</title>\n' +
        '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">TP</text></svg>') + '">\n' +
        '<style>\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FAFAF8;color:#0A0A0A;min-height:100vh;font-weight:300;font-size:16px;line-height:1.7}\n' +
        '  .hero{background:#002FA7;color:#FAFAF8;padding:40px 32px 36px}\n' +
        '  .hero-inner{max-width:720px;margin:0 auto}\n' +
        '  .hero a{color:inherit;text-decoration:none;font-size:13px;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;opacity:.6;letter-spacing:.04em}\n' +
        '  .hero a:hover{opacity:1}\n' +
        '  .hero h1{font-size:min(2.8vw,3.6vh);font-weight:200;letter-spacing:-0.02em;line-height:1.2;margin-top:8px}\n' +
        '  .content{max-width:720px;margin:0 auto;padding:32px}\n' +
        '  .content h2{font-size:20px;font-weight:400;margin:32px 0 10px;color:#0A0A0A;letter-spacing:-0.01em}\n' +
        '  .content h3{font-size:17px;font-weight:400;margin:24px 0 8px;color:#333}\n' +
        '  .content p{margin:8px 0;color:#333}\n' +
        '  .content ul{margin:8px 0;padding-left:24px}\n' +
        '  .content li{margin:4px 0;color:#333;font-size:15px}\n' +
        '  .content code{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:13px;background:#F0F0EC;padding:1px 6px}\n' +
        '  .content pre{background:#0A0A0A;color:#FAFAF8;padding:16px 20px;margin:12px 0;overflow-x:auto;font-size:13px;line-height:1.55}\n' +
        '  .content pre code{background:none;padding:0;color:inherit}\n' +
        '  .content a{color:#002FA7;text-decoration:none}\n' +
        '  .content a:hover{text-decoration:underline}\n' +
        '  .content strong{font-weight:500;color:#0A0A0A}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/tips">← 返回列表</a><h1>' + tip.title + '</h1></div></div>\n' +
        '<div class="content">' + renderMarkdown(tip.body) + '</div>\n</body>\n</html>';
      res.send(html);
    });
  }

  app.use(express.static(PROJECT_DIR));

  app.get('/api/tools', function(req, res) {
    try {
      var tools = scanTools();
      res.json({ ok: true, tools: tools });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/tools/start/:id', function(req, res) {
    res.json(startTool(req.params.id));
  });

  app.post('/api/tools/stop/:id', function(req, res) {
    stopTool(req.params.id, function(_err, result) {
      res.json(result);
    });
  });

  app.post('/api/tools/reorder', function(req, res) {
    var items = req.body.items;
    if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items required' });
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var mfPath = safeResolve(TOOLS_DIR, item.id, 'manifest.json');
      if (!mfPath) continue;
      var mf;
      try { mf = JSON.parse(read(mfPath)); } catch(_) { continue; }
      mf.order = item.order;
      try { fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8'); } catch(_) {}
    }
    res.json({ ok: true });
  });

  function tryListen(port) {
    var server = app.listen(port, function() {
      console.log('\n⚙  工具架 · Agentboard  http://localhost:' + port + '\n');
    });
    server.on('error', function(err) {
      if (err.code === 'EADDRINUSE') {
        console.error('\n  ✖ Port ' + port + ' is in use. Agentboard requires a fixed port to be discoverable.\n');
        console.error('  Free port ' + port + ' and restart: npx kill-port ' + port + '\n');
        process.exit(1);
      } else { throw err; }
    });
  }
  tryListen(PREFERRED_PORT);
}

if (require.main === module) {
  console.log('\n📋 Agentboard scanning ' + TOOLS_DIR + '\n');
  if (!fs.existsSync(TOOLS_DIR)) {
    console.log('  ⚠ ~/.claude/tools/ does not exist. Create a manifest.json in a subdirectory to register a tool.\n');
  }
  startServer();
}
