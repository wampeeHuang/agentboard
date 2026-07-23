// Safety: PM2 io-bpm NotifyFeature calls process.exit(1) when it's the only
// uncaughtException listener ("listeners.length === 1" check in notify.js:128).
// This pre-handler ensures there are always ≥2 listeners, so PM2 never kills
// the process silently. It also logs the error before PM2's handler runs,
// since PM2's handler (registered during process bootstrap) fires first and
// would otherwise exit before our server.js handler gets a chance to log.
// Root cause: 2026-07-18 crash storm — 32 restarts/40min, exit code 1,
// no error in logs. Tracked to notify.js:129 via crash-forensics.log.
process.prependListener('uncaughtException', function(err) {
  try {
    var opslog_pre = require('./lib/ops-log');
    opslog_pre.error('uncaughtException-pre', (err && err.message) || String(err), {
      code: err && err.code,
      stack: (err && err.stack || '').split('\n').slice(0, 3).join('\n')
    });
  } catch(_) {}
});

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');
var registry = require('./lib/tool-registry');
var opslog = require('./lib/ops-log');

var serverStartTime = Date.now();
var EVENTS_LOG = path.join(__dirname, '_runtime', 'events.jsonl');

function getHealth() {
  var now = Date.now();
  var lines = [];
  try {
    var raw = fs.readFileSync(EVENTS_LOG, 'utf8');
    if (raw.trim()) lines = raw.trim().split('\n').map(function(l) {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) {}

  var crashes24h = lines.filter(function(e) {
    return (now - new Date(e.ts).getTime()) < 86400000 &&
      (e.event === 'tool-crash' || e.event === 'tool-rejection' || e.event === 'tool-spawn-error');
  }).length;

  var seenPids = {};
  var abnormalDeaths = [];
  for (var i = 0; i < lines.length; i++) {
    var entry = lines[i];
    if (entry.event === 'server-start' && entry.pid && !seenPids[entry.pid]) {
      seenPids[entry.pid] = true;
      if (entry.pid === process.pid) continue;
      var hadActivity = false, hadCrash = false;
      for (var j = i + 1; j < lines.length; j++) {
        if (lines[j].event === 'server-start') break;
        if (lines[j].pid === entry.pid) hadActivity = true;
        if (lines[j].event === 'tool-crash' || lines[j].event === 'tool-rejection') hadCrash = true;
      }
      if (!hadActivity && !hadCrash) continue;
      if (!hadCrash) {
        var deathTs = '';
        for (var k = i + 1; k < lines.length; k++) {
          if (lines[k].event === 'server-start' && lines[k].pid !== entry.pid) { deathTs = lines[k].ts; break; }
        }
        abnormalDeaths.push({ pid: entry.pid, startedAt: entry.ts, presumedDeadAt: deathTs || 'unknown' });
      }
    }
  }

  var lastEvent = lines.length > 0 ? lines[lines.length - 1] : null;
  return {
    status: crashes24h > 0 ? 'degraded' : 'ok',
    pid: process.pid,
    uptime: Math.round((now - serverStartTime) / 1000),
    totalLines: lines.length,
    crashes24h: crashes24h,
    abnormalDeaths: abnormalDeaths,
    snapshot: {
      totalEvents: lines.length,
      events24h: lines.filter(function(e) { return (now - new Date(e.ts).getTime()) < 86400000; }).length,
      crashes24h: crashes24h,
      lastEvent: lastEvent ? lastEvent.event : null,
      lastEventTs: lastEvent ? lastEvent.ts : null
    }
  };
}

const PROJECT_DIR = __dirname;
const AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(os.homedir(), '.agentboard');
const TOOLS_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
const TOOLS_DIRS = [TOOLS_DIR];
const SKILLS_DIR = process.env.AGENTBOARD_SKILLS_DIR || path.join(os.homedir(), '.claude', 'skills');
var apiHTML = require('./api-page');
const TIPS_DIR = process.env.AGENTBOARD_TIPS_DIR || path.join(AGENTBOARD_HOME, 'tips');
const LOCAL_TOOLS_DIR = path.join(PROJECT_DIR, 'tools');
const LOCAL_SKILLS_DIR = path.join(PROJECT_DIR, 'skills');
const PREFERRED_PORT = parseInt(process.env.PORT || '3099', 10);
const PLATFORM = process.platform;

function read(p) { try { return fs.readFileSync(p,'utf8'); } catch(_) { return null; } }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function monogram(name) { var s = (name||'').trim(); var en = s.match(/[A-Za-z][A-Za-z\s]+/); if (en) { var w = en[0].split(/\s+/).filter(Boolean); if (w.length >= 2) return (w[0][0] + w[w.length-1][0]).toUpperCase(); if (w.length === 1 && w[0].length >= 2) return w[0].substring(0,2).toUpperCase(); } var cn = s.replace(/[^一-鿿]/g,''); if (cn.length >= 2) return cn[0] + cn[cn.length-1]; var ascii = s.replace(/[^A-Za-z0-9]/g,''); if (ascii.length >= 2) return ascii.substring(0,2).toUpperCase(); return (s.substring(0,2) || '??').toUpperCase(); }
function listDirs(p) { try { return fs.readdirSync(p,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name); } catch(_) { return []; } }
function openFolder(p) { try { exec('start "" "' + p + '"'); } catch(_) {} }

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

// Chinese skill name -> SKILL.md name: field not used, map ourselves
var CHINESE_NAMES = {
  'algorithmic-art': '算法艺术',
  'brand-guidelines': '品牌设计指南',
  'canvas-design': '画布设计',
  'claude-api': 'Claude API 开发',
  'doc-coauthoring': '文档协同写作',
  'docx': 'Word 文档处理',
  'frontend-design': '前端界面设计',
  'internal-comms': '内部沟通文案',
  'mcp-builder': 'MCP 服务构建',
  'pdf': 'PDF 文档处理',
  'pptx': 'PPT 演示文稿',
  'skill-creator': '技能创建器',
  'slack-gif-creator': 'Slack GIF 制作',
  'theme-factory': '主题工厂',
  'web-artifacts-builder': 'Web 构件生成',
  'webapp-testing': 'Web 应用测试',
  'xlsx': 'Excel 表格处理',
  'beautiful-feishu-whiteboard': '飞书白板设计',
  'beautiful-html-templates': '精美 HTML 模板',
  'codebase-to-course': '代码库转课程',
  'frontend-slides-editable': '可编辑幻灯片',
  'huashu-design': '花叔设计',
  'nuwa-skill': '女娲技能',
  'evolution-cat-infographic': '进化猫图文流水线',
  'guizang-social-card-skill': '归藏社交卡片',
  'guizang-ppt-skill': '归藏PPT',
  'claude-mem': '记忆系统',
  'find-docs': '文档查找',
  'huashu-research': '花叔调研',
  'wechat-article-reader': '微信文章阅读',
  'video-analyzer': '视频分析',
  'perspective-router': '视角路由器',
  'evolution-cat-article': '进化猫文章写作',
  'evolution-cat': '进化猫写作引擎',
  'skill-craftsmanship-framework': '工匠框架',
  'social-image-publisher': '矩阵图文发布',
  'anysearch': 'AnySearch 搜索',
  'opencli-usage': 'OpenCLI 使用指南',
  'opencli-adapter-author': 'OpenCLI 适配器编写',
  'opencli-autofix': 'OpenCLI 自动修复',
  'opencli-browser': 'OpenCLI 浏览器',
  'opencli-browser-sitemap': 'OpenCLI 站点地图',
  'opencli-sitemap-author': 'OpenCLI 站点地图编写',
  'smart-search': '智能搜索'
};
function getChineseName(name) {
  if (CHINESE_NAMES[name]) return CHINESE_NAMES[name];
  if (name.indexOf('perspective-') === 0) {
    var person = name.slice('perspective-'.length).replace(/-/g, ' ');
    return person.replace(/\b\w/g, function(c) { return c.toUpperCase(); }) + ' 视角';
  }
  return name;
}

function scanAllSkills() {
  var seen = {};
  var skills = [];
  if (!fs.existsSync(SKILLS_DIR)) return skills;
  listDirs(SKILLS_DIR).forEach(function(name) {
    if (seen[name]) return;
    seen[name] = true;
    var skillMd = read(path.join(SKILLS_DIR, name, 'SKILL.md'));
    if (!skillMd) return;
    var fm = {};
    var fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      var lines = fmMatch[1].split('\n');
      var mlKey = null, mlVal = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var m = line.match(/^(\w+):\s*(.+)/);
        if (m) {
          if (mlKey) { fm[mlKey] = mlVal.join('\n').trim(); mlKey = null; mlVal = []; }
          var val = m[2].trim();
          if (val === '|' || val === '>') { mlKey = m[1]; }
          else { fm[m[1]] = val; }
        } else if (mlKey) {
          var im = line.match(/^\s{2,}(.+)/);
          if (im) { mlVal.push(im[1]); }
        }
      }
      if (mlKey) { fm[mlKey] = mlVal.join('\n').trim(); }
    }
    var desc = fm.description || '';
    if (!desc) {
      var body = skillMd.replace(/^---[\s\S]*?---\n*/, '').replace(/^#\s+.*\n*/, '');
      var lines = body.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line && !line.startsWith('#') && !line.startsWith('>') && line.length > 10) {
          desc = line.substring(0, 120);
          break;
        }
      }
    }
    var words = name.split(/[-_]/).filter(function(w) { return w.length > 0; });
    var mono = words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
    skills.push({
      name: name,
      displayName: getChineseName(name),
      description: desc,
      trigger: fm.trigger || '',
      mono: mono,
      category: classifySkill(name, desc),
      folderPath: path.join(SKILLS_DIR, name)
    });
  });
  return skills;
}

function classifySkill(name, desc) {
  // 单一维度：技能产出什么
  var MAP = {
    'algorithmic-art': '视觉与设计',
    'beautiful-feishu-whiteboard': '视觉与设计',
    'brand-guidelines': '视觉与设计',
    'canvas-design': '视觉与设计',
    'frontend-design': '视觉与设计',
    'huashu-design': '视觉与设计',
    'theme-factory': '视觉与设计',
    'slack-gif-creator': '视觉与设计',
    'frontend-slides-editable': '视觉与设计',
    'doc-coauthoring': '写作与文档',
    'internal-comms': '写作与文档',
    'codebase-to-course': '写作与文档',
    'docx': '文件与格式',
    'pptx': '文件与格式',
    'xlsx': '文件与格式',
    'pdf': '文件与格式',
    'claude-api': '开发与工具',
    'mcp-builder': '开发与工具',
    'web-artifacts-builder': '开发与工具',
    'webapp-testing': '开发与工具',
    'perspective-router': '思维与方法',
    'nuwa-skill': '思维与方法',
    'skill-creator': '思维与方法',
    'evolution-cat-infographic': '写作与文档',
    'guizang-social-card-skill': '视觉与设计',
    'guizang-ppt-skill': '视觉与设计',
    'claude-mem': '思维与方法',
    'find-docs': '开发与工具',
    'huashu-research': '思维与方法',
    'wechat-article-reader': '写作与文档',
    'video-analyzer': '开发与工具',
    'beautiful-html-templates': '视觉与设计',
    'evolution-cat-article': '写作与文档',
    'skill-craftsmanship-framework': '思维与方法',
    'social-image-publisher': '开发与工具',
    'anysearch': '开发与工具',
    'opencli-usage': '开发与工具',
    'opencli-adapter-author': '开发与工具',
    'opencli-autofix': '开发与工具',
    'opencli-browser': '开发与工具',
    'opencli-browser-sitemap': '开发与工具',
    'opencli-sitemap-author': '开发与工具',
    'smart-search': '开发与工具'
  };
  if (MAP[name]) return MAP[name];
  var s = (name + ' ' + (desc || '')).toLowerCase();
  if (/(design|art|theme|visual|brand|canvas|illustrat|gif|animation|whiteboard|feishu)/i.test(s)) return '视觉与设计';
  if (/(writ|doc|article|internal.comm|report|blog|memo|faq)/i.test(s)) return '写作与文档';
  if (/(pdf|docx|xlsx|pptx?|excel|word|powerpoint|format|convert|markdown|csv|spreadsheet)/i.test(s)) return '文件与格式';
  if (/(api|mcp|sdk|server|code|test|debug|build|deploy|playwright|browser|automation|cli|git|npm|node|react|tailwind|component)/i.test(s)) return '开发与工具';
  if (/(perspective|mindset|framework|think|mentor|philosophy|methodology|distill)/i.test(s)) return '思维与方法';
  return '其他';
}

function renderMarkdown(md, opts) {
  opts = opts || {};
  var keepH1 = opts.keepH1 !== false;
  var body = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!keepH1) body = body.replace(/^#\s+.*\n/, '');
  body = body.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>';
  });
  body = body.replace(/`([^`]+)`/g, '<code>$1</code>');
  body = body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  body = body.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  body = body.replace(/^### (.+)/gm, '<h3>$1</h3>');
  body = body.replace(/^## (.+)/gm, '<h2>$1</h2>');
  if (keepH1) body = body.replace(/^# (.+)/gm, '<h1>$1</h1>');
  body = body.replace(/^- (.+)/gm, '<li>$1</li>');
  body = body.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  body = body.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
  body = body.replace(/<p>\s*<\/p>/g, '');
  return body;
}

function scanTools() { return registry.scanTools(TOOLS_DIRS.concat([LOCAL_TOOLS_DIR])); }
function findManifest(id) { return registry.findManifest(id, TOOLS_DIRS); }
function startTool(id) { return registry.startTool(id, TOOLS_DIRS.concat([LOCAL_TOOLS_DIR])); }
function stopTool(id) { return registry.stopTool(id, TOOLS_DIRS); }
function createTool(body) { return registry.createTool(body, TOOLS_DIRS); }
function updateTool(id, body) { return registry.updateTool(id, body, TOOLS_DIRS); }

function skillIndexHTML(skills) {
  var catNames = ['视觉与设计','写作与文档','文件与格式','开发与工具','思维与方法'];
  var catCounts = {};
  skills.forEach(function(s) { var c = s.category || '其他'; catCounts[c] = (catCounts[c] || 0) + 1; });
  var bar = '<div class="cat-bar">' +
    '<button class="cat-pill active" data-cat="all" onclick="setSkillFilter(\'all\')">全部<span class="count">' + skills.length + '</span></button>' +
    catNames.map(function(cn) {
      if (!catCounts[cn]) return '';
      return '<button class="cat-pill" data-cat="' + cn + '" onclick="setSkillFilter(\'' + cn + '\')">' + cn + '<span class="count">' + (catCounts[cn] || 0) + '</span></button>';
    }).join('') +
    '</div>';
  var cards = skills.map(function(s) {
    return '<div class="skill-card" data-cat="' + s.category + '">' +
      '<div class="card-body">' +
        '<div class="card-mono">' + esc(s.mono) + '</div>' +
        '<div class="card-info">' +
          '<div class="card-name">' + esc(s.name) + '</div>' +
          '<div class="card-sub">' + esc(s.displayName || s.name) + '</div>' +
          (s.description ? '<div class="card-desc" title="' + esc(s.description) + '"><b>简介</b> ' + esc(s.description) + '</div>' : '') +
          (s.trigger ? '<div class="skill-trigger"><span>触发</span> ' + esc(s.trigger) + '</div>' : '') +
          '<div class="skill-folder" title="点击复制路径: ' + esc(s.folderPath) + '">' +
            '<span class="folder-path">' + esc(s.folderPath) + '</span>' +
            '<button class="folder-open" onclick="event.stopPropagation();fetch(\'/open-dir/' + encodeURIComponent(s.name) + '\')" title="在资源管理器打开">↗</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('\n');
  return '<style>\n' +
'.skill-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:12px;margin-top:8px}\n' +
'.skill-card{background:var(--paper);padding:20px;display:flex;flex-direction:column;gap:10px;transition:transform .15s,box-shadow .15s;position:relative;box-shadow:var(--shadow-border),var(--shadow-card);cursor:default}\n' +
'.skill-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
'.card-body{display:flex;align-items:flex-start;gap:12px;flex:1}\n' +
'.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:13px;font-weight:500}\n' +
'.card-info{flex:1;min-width:0}\n' +
'.card-name{font-size:16px;font-weight:300;letter-spacing:-0.01em;line-height:1.35}\n' +
'.card-sub{font-size:12px;color:var(--text-muted);font-weight:300;line-height:1.35;margin-top:2px}\n' +
'.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\n' +
'.card-desc b{font-weight:500;color:var(--text)}\n' +
'.skill-card:hover .card-desc{-webkit-line-clamp:unset;overflow:visible}\n' +
'.skill-trigger{font-size:11px;color:var(--text-muted);margin-top:4px}\n' +
'.skill-trigger span{font-size:9px;font-weight:500;color:var(--ink);border:1px solid var(--ink);padding:0 4px;margin-right:4px}\n' +
'.skill-folder{font-size:11px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 6px;background:var(--paper-tint);transition:background .12s}\n' +
'.skill-folder:hover{background:rgba(0,47,167,0.06)}\n' +
'.skill-folder .folder-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}\n' +
'.skill-folder .folder-open{background:none;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:12px;padding:1px 4px;line-height:1;flex-shrink:0}\n' +
'.skill-folder .folder-open:hover{background:var(--ink);color:var(--paper)}\n' +
'.folder-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:8px 20px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}\n' +
'.folder-toast.show{opacity:1}\n' +
'.cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}\n' +
'.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint, #F2F2F0);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
'.cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
'.cat-pill.active{background:var(--ink);border-color:var(--ink);color:var(--paper)}\n' +
'.cat-pill .count{font-size:10px;opacity:.7}\n' +
'.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
'.back-link:hover{border-color:var(--ink);color:var(--ink)}\n' +
'</style>\n' +
    '<a class="back-link" href="/">← 返回工具架</a>' + bar + '<div class="skill-grid">' + cards + '</div>' +
    '<div class="folder-toast" id="folderToast"></div>' +
    '<script>\n' +
    'function setSkillFilter(t){\n' +
    '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});\n' +
    '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.cat===t)p.classList.add("active");});\n' +
    '  document.querySelectorAll(".skill-card").forEach(function(c){\n' +
    '    if(t==="all"||c.dataset.cat===t){c.style.display="flex";}else{c.style.display="none";}\n' +
    '  });\n' +
    '}\n' +
    'document.querySelectorAll(".skill-folder").forEach(function(el){el.addEventListener("click",function(e){\n' +
    '  if(e.target.closest(".folder-open"))return;\n' +
    '  var path=el.getAttribute("title").replace("点击复制路径: ","");\n' +
    '  navigator.clipboard.writeText(path).then(function(){\n' +
    '    var t=document.getElementById("folderToast");t.textContent="已复制: "+path;t.classList.add("show");\n' +
    '    setTimeout(function(){t.classList.remove("show")},2000);\n' +
    '  });\n' +
    '})});\n' +
    '<\/script>';
}


// Built-in Claude Code slash commands organized by category
var BUILTIN_COMMANDS = [
  {cat:'会话控制',trigger:'clear',name:'清空对话',desc:'清空当前会话的所有对话历史和上下文'},
  {cat:'会话控制',trigger:'compact',name:'压缩上下文',desc:'压缩上下文窗口，释放 token 配额，保留关键信息'},
  {cat:'会话控制',trigger:'context',name:'上下文用量',desc:'查看当前会话的上下文/缓存使用情况和 token 统计'},
  {cat:'会话控制',trigger:'copy',name:'复制回复',desc:'将 Claude 最近一次回复内容复制到剪贴板'},
  {cat:'会话控制',trigger:'cost',name:'API 费用',desc:'查看当前会话累计的 API 调用费用'},
  {cat:'会话控制',trigger:'resume',name:'恢复会话',desc:'交互式选择并恢复之前的会话记录'},
  {cat:'会话控制',trigger:'status',name:'运行状态',desc:'查看 Claude Code 当前运行状态和会话信息'},
  {cat:'会话控制',trigger:'model',name:'切换模型',desc:'切换当前会话使用的 AI 模型（sonnet/opus/haiku）'},
  {cat:'会话控制',trigger:'fast',name:'快速模式',desc:'切换快速模式（Opus 低延迟输出），适用于快速响应'},
  {cat:'会话控制',trigger:'upgrade',name:'升级版本',desc:'检查并升级 Claude Code 到最新版本'},
  {cat:'配置管理',trigger:'config',name:'配置管理',desc:'查看和修改 Claude Code 各项配置（模型、权限等）'},
  {cat:'配置管理',trigger:'theme',name:'切换主题',desc:'切换终端界面的配色主题（亮色/暗色）'},
  {cat:'配置管理',trigger:'permissions',name:'权限管理',desc:'管理工具的权限模式和审批规则'},
  {cat:'配置管理',trigger:'output-style',name:'输出风格',desc:'设置 Claude 回复的输出风格和格式偏好'},
  {cat:'配置管理',trigger:'verbose',name:'详细输出',desc:'切换详细输出模式，显示更多调试信息'},
  {cat:'配置管理',trigger:'auto-compact',name:'自动压缩',desc:'切换自动上下文压缩功能开关'},
  {cat:'项目管理',trigger:'init',name:'项目初始化',desc:'在当前目录创建 CLAUDE.md 项目配置文件'},
  {cat:'项目管理',trigger:'project',name:'项目管理',desc:'管理项目级别的 Claude Code 设置和状态'},
  {cat:'项目管理',trigger:'agents',name:'Agent 管理',desc:'配置和管理后台运行的 AI Agent 实例'},
  {cat:'项目管理',trigger:'mcp',name:'MCP 管理',desc:'配置和管理 MCP（Model Context Protocol）服务器'},
  {cat:'项目管理',trigger:'plugin',name:'插件管理',desc:'安装和管理 Claude Code 插件扩展'},
  {cat:'项目管理',trigger:'add-dir',name:'添加目录',desc:'添加额外的工作目录以供 Claude 工具访问'},
  {cat:'项目管理',trigger:'worktree',name:'工作树',desc:'创建 Git worktree 隔离工作环境'},
  {cat:'代码分析',trigger:'review',name:'代码审查',desc:'对当前代码变更进行审查，输出改进建议'},
  {cat:'代码分析',trigger:'test',name:'运行测试',desc:'运行项目的测试套件并分析结果'},
  {cat:'代码分析',trigger:'lint',name:'代码检查',desc:'运行代码 Lint 检查，输出规范问题和修复建议'},
  {cat:'代码分析',trigger:'explain',name:'解释代码',desc:'解释选中代码段或文件的逻辑和设计意图'},
  {cat:'代码分析',trigger:'pr-comments',name:'PR 评论',desc:'为当前分支的 PR 自动生成评论和说明'},
  {cat:'代码分析',trigger:'ultrareview',name:'云端审查',desc:'使用云端多 Agent 对当前分支进行深度代码审查'},
  {cat:'代码分析',trigger:'code-review',name:'五条判准门禁',desc:'AI 代码五条工程判断力门禁——可解释性/diff克制/抽象时机/可推理/判断所有权'},
  {cat:'代码分析',trigger:'security-review',name:'安全审查',desc:'对代码变更进行安全漏洞审查——数据流向/静默失败/最小权限'},
  {cat:'代码分析',trigger:'cr',name:'CR 深度审查',desc:'阿里巴巴CR CLI——内置安全规则库+LLM深度推理，行级精度代码审查'},
  {cat:'记忆系统',trigger:'memory',name:'持久记忆',desc:'查看、编辑和管理 Claude Code 的持久化记忆'},
  {cat:'记忆系统',trigger:'remember',name:'记住内容',desc:'让 Claude 记住当前讨论的关键信息供后续使用'},
  {cat:'IDE 集成',trigger:'ide',name:'IDE 连接',desc:'自动连接可用的 IDE 编辑器（VS Code / JetBrains）'},
  {cat:'IDE 集成',trigger:'terminal-setup',name:'终端设置',desc:'在终端中设置 Claude Code 的快捷键绑定'},
  {cat:'账户认证',trigger:'login',name:'账户登录',desc:'登录 Anthropic 账户以使用 Claude Code'},
  {cat:'账户认证',trigger:'logout',name:'账户登出',desc:'登出当前 Anthropic 账户'},
  {cat:'账户认证',trigger:'auth',name:'认证管理',desc:'管理认证方式和凭据（API Key / OAuth）'},
  {cat:'账户认证',trigger:'setup-token',name:'设置 Token',desc:'设置长期有效的 API 认证令牌（需订阅）'},
  {cat:'诊断帮助',trigger:'help',name:'帮助信息',desc:'显示 Claude Code 帮助文档和可用命令列表'},
  {cat:'诊断帮助',trigger:'doctor',name:'系统诊断',desc:'检查 Claude Code 运行健康和自动更新状态'}
];

function commandsIndexHTML() {
  var catOrder = ['会话控制','配置管理','项目管理','代码分析','记忆系统','IDE 集成','账户认证','诊断帮助'];
  var catCounts = {};
  BUILTIN_COMMANDS.forEach(function(c) { catCounts[c.cat] = (catCounts[c.cat] || 0) + 1; });
  var cmdsByCat = {};
  BUILTIN_COMMANDS.forEach(function(c) {
    if (!cmdsByCat[c.cat]) cmdsByCat[c.cat] = [];
    cmdsByCat[c.cat].push(c);
  });

  var bar = '<div class="cat-bar">' +
    '<button class="cat-pill active" data-cat="all" onclick="setFilter(\'all\')">全部<span class="count">' + BUILTIN_COMMANDS.length + '</span></button>' +
    catOrder.map(function(cn) {
      if (!catCounts[cn]) return '';
      return '<button class="cat-pill" data-cat="' + esc(cn) + '" onclick="setFilter(\'' + esc(cn) + '\')">' + cn + '<span class="count">' + (catCounts[cn] || 0) + '</span></button>';
    }).join('') +
    '</div>';

  var html = '';
  catOrder.forEach(function(cat) {
    var cmds = cmdsByCat[cat];
    if (!cmds) return;
    html += '<div class="cmd-section" data-cat="' + esc(cat) + '"><h2>' + esc(cat) + ' <span style="font-weight:300;font-size:13px;color:var(--text-muted)">' + cmds.length + ' 个命令</span></h2>';
    html += '<div class="cmd-table-wrap"><table class="cmd-table"><thead><tr><th style="width:160px">命令</th><th style="width:140px">名称</th><th>说明</th></tr></thead><tbody>';
    cmds.forEach(function(c) {
      html += '<tr>' +
        '<td><code class="cmd-code">/' + esc(c.trigger) + '</code></td>' +
        '<td>' + esc(c.name) + '</td>' +
        '<td class="cmd-desc">' + esc(c.desc) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div></div>';
  });

  return '<style>\n' +
    '.cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px}\n' +
    '.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
    '.cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
    '.cat-pill.active{background:var(--ink);border-color:var(--ink);color:var(--paper)}\n' +
    '.cat-pill .count{font-size:10px;opacity:.7}\n' +
    '.cmd-section h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}\n' +
    '.cmd-table-wrap{overflow-x:auto}\n' +
    '.cmd-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}\n' +
    '.cmd-table th{background:var(--paper-tint);font-weight:500;font-size:12px;padding:8px 12px;border:1px solid var(--border);text-align:left;white-space:nowrap}\n' +
    '.cmd-table td{padding:8px 12px;border:1px solid var(--border);font-size:13px;line-height:1.5}\n' +
    '.cmd-code{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:12px;background:var(--paper-tint);padding:2px 6px;color:var(--ink);white-space:nowrap}\n' +
    '.cmd-desc{color:var(--text-secondary);font-size:12px}\n' +
    '.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
    '.back-link:hover{border-color:var(--ink);color:var(--ink)}\n' +
    '.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--ink);margin-bottom:8px}\n' +
    '.page .subtitle{font-size:13px;color:var(--text-muted);font-weight:300;margin-bottom:24px}\n' +
  '</style>\n' +
  '<h1>Claude Code 命令</h1>\n' +
  '<div class="subtitle">内置斜杠命令参考 · 在 Claude Code 会话中输入 <code>/</code> + 命令名即可触发</div>\n' +
  bar +
  html +
  '<script>\n' +
  'function setFilter(t){' +
  '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});' +
  '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.cat===t)p.classList.add("active");});' +
  '  document.querySelectorAll(".cmd-section").forEach(function(s){' +
  '    if(t==="all"||s.dataset.cat===t){s.style.display="";}else{s.style.display="none";}' +
  '  });' +
  '}' +
  '<\/script>';
}


function startServer() {
  const app = express();
  app.use(express.json());

  // --- request logging (in-memory + file, date-partitioned) ---
  var LOGS_DIR = path.join(AGENTBOARD_HOME, 'state', 'api-calls');
  var apiLog = []; // [{ts, method, path, ua, caller, action, target}]
  var apiCounts = {}; // { '/api/tools': {count, first, last}, ... }
  try { fs.mkdirSync(LOGS_DIR, {recursive:true}); } catch(_) {}

  function todayLogPath() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var dir = path.join(LOGS_DIR, yyyy + '-' + mm);
    try { fs.mkdirSync(dir, {recursive:true}); } catch(_) {}
    return path.join(dir, dd + '.jsonl');
  }

  // migrate legacy flat file
  var OLD_LOG = path.join(AGENTBOARD_HOME, 'state', 'api-calls.jsonl');
  if (fs.existsSync(OLD_LOG)) {
    try {
      var oldContent = read(OLD_LOG);
      if (oldContent && oldContent.trim()) {
        var oldLines = oldContent.trim().split('\n');
        for (var oi = 0; oi < oldLines.length; oi++) {
          try {
            var oe = JSON.parse(oldLines[oi]);
            if (oe && oe.ts) {
              var d = new Date(oe.ts);
              var yyyy = d.getFullYear();
              var mm = String(d.getMonth() + 1).padStart(2, '0');
              var dd = String(d.getDate()).padStart(2, '0');
              var mdir = path.join(LOGS_DIR, yyyy + '-' + mm);
              try { fs.mkdirSync(mdir, {recursive:true}); } catch(_) {}
              fs.appendFileSync(path.join(mdir, dd + '.jsonl'), JSON.stringify(oe) + '\n', 'utf8');
            }
          } catch(_) {}
        }
      }
      fs.unlinkSync(OLD_LOG);
    } catch(_) {}
  }

  // classify: who called
  function classifyCaller(ua) {
    if (!ua) return 'unknown';
    if (/curl|axios|node-fetch|python-requests|httpie/i.test(ua)) return 'agent';
    if (/Mozilla.*(Chrome|Firefox|Safari|Edge)/i.test(ua)) return 'browser';
    if (/Java|Go-http|Ruby/i.test(ua)) return 'agent';
    return 'unknown';
  }

  // classify: what kind of operation
  function classifyAction(method, path) {
    if (path === '/api/tools' && method === 'GET') return 'list';
    if (/^\/api\/tools\/[^/]+$/.test(path) && method === 'GET') return 'detail';
    if (/^\/api\/tools\/(start|stop)\//.test(path) && method === 'POST') return 'control';
    if (path === '/api/tools/reorder' && method === 'POST') return 'control';
    if (path === '/api/stats' && method === 'GET') return 'admin';
    if (path === '/api/tips' || path.startsWith('/api/tips/')) return 'admin';
    return 'admin';
  }

  // extract tool id from path: /api/tools/start/forma → forma
  function classifyTarget(path) {
    var m = path.match(/^\/api\/tools\/(?:start|stop)\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = path.match(/^\/api\/tools\/([a-zA-Z0-9_-]+)$/);
    if (m && m[1] !== 'reorder') return m[1];
    return null;
  }

  // load all date-partitioned logs
  try {
    var months = listDirs(LOGS_DIR);
    months.forEach(function(mo) {
      var mdir = path.join(LOGS_DIR, mo);
      var days = fs.readdirSync(mdir).filter(function(f) { return f.endsWith('.jsonl'); });
      days.forEach(function(day) {
        var content = read(path.join(mdir, day));
        if (!content) return;
        var lines = content.trim().split('\n');
        for (var li = 0; li < lines.length; li++) {
          try { var entry = JSON.parse(lines[li]); if (entry) apiLog.push(entry); } catch(_) {}
        }
      });
    });
  } catch(_) {}

  // rebuild counts from log
  for (var ai = 0; ai < apiLog.length; ai++) {
    var e = apiLog[ai]; var k = (e.method||'GET') + ' ' + (e.path||'/');
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: e.ts, last: e.ts };
    apiCounts[k].count++; apiCounts[k].last = e.ts;
    if (!e.caller) e.caller = classifyCaller(e.ua||'');
    if (!e.action) e.action = classifyAction(e.method||'GET', e.path||'/');
    if (!e.target) e.target = classifyTarget(e.path||'/');
  }

  function logApiCall(method, p, ua, statusCode) {
    var entry = {
      ts: new Date().toISOString(),
      method: method, path: p,
      status: statusCode || 0,
      ua: (ua||'').slice(0, 120),
      caller: classifyCaller(ua||''),
      action: classifyAction(method, p),
      target: classifyTarget(p)
    };
    apiLog.push(entry);
    var k = method + ' ' + p;
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: entry.ts, last: entry.ts };
    apiCounts[k].count++; apiCounts[k].last = entry.ts;
    try { fs.appendFileSync(todayLogPath(), JSON.stringify(entry) + '\n', 'utf8'); } catch(_) {}
  }
  app.use(function(req, res, next) {
    if (req.path.startsWith('/api/')) {
      res.on('finish', function() {
        logApiCall(req.method, req.path, req.get('user-agent')||'', res.statusCode);
      });
    }
    next();
  });


  app.get('/api', function(req, res) {
    var data = {
      name: 'Agentboard',
      version: '1.0.0',
      description: 'Filesystem-as-registry toolchain control plane for AI agents',
      endpoints: {
        // ── 服务发现 Discovery ──
        'GET /api': {
          description: 'API discovery document — all endpoints with metadata, manifest schema, full tools list',
          category: '服务发现',
          curl: 'curl http://localhost:3099/api',
          response: '{ name, version, description, endpoints, manifestSchema, tools, toolsDir, skillsDir }'
        },
        // ── 工具管理 Tool Mgmt ──
        'GET /api/tools': {
          description: 'List all registered tools with running status, conflicts, and agent_notes',
          category: '工具管理',
          curl: 'curl http://localhost:3099/api/tools',
          response: '{ ok: true, tools: [...] }',
          note: '每次操作工具前必调——读取 conflicts 和 agent_notes 字段'
        },
        'GET /api/tools/:id': {
          description: 'Get a single tool by id',
          category: '工具管理',
          curl: 'curl http://localhost:3099/api/tools/minicpm-v',
          response: '{ ok: true, tool: {...} }'
        },
        'POST /api/tools/start/:id': {
          description: 'Start a tool by id (executes startCommand from manifest)',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/start/ace-step',
          body: 'Path param: :id = 工具目录名 / tool directory name',
          response: '{ ok: true } 或 { ok: false, error: "..." }'
        },
        'POST /api/tools/stop/:id': {
          description: 'Stop a tool by id (executes stopCommand from manifest)',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/stop/ace-step',
          body: 'Path param: :id = 工具目录名 / tool directory name',
          response: '{ ok: true } 或 { ok: false, error: "..." }'
        },
        'POST /api/tools/reorder': {
          description: 'Reorder tools — writes new order values to manifest files',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools/reorder -H "Content-Type: application/json" -d \'{"items":[{"id":"ace-step","order":1}]}\'',
          body: 'JSON: { items: [{ id: "tool-id", order: <number> }, ...] }',
          response: '[{ id, ok: true|false, error? }]'
        },
        'POST /api/tools': {
          description: 'Create a new tool — makes ~/.agentboard/tools/{id}/manifest.json',
          category: '工具管理',
          curl: 'curl -X POST http://localhost:3099/api/tools -H "Content-Type: application/json" -d \'{"id":"my-tool","name":"My Tool","category":"创作","startCommand":"node server.js","stopCommand":"npx kill-port 3000","port":3000}\'',
          body: 'JSON: { id (lowercase a-z, 0-9, -, _), name, description?, icon?, version?, category?, order?, port?, ports?, projectPath?, url?, startCommand?, stopCommand?, publicUrl?, owner?, apiBase?, type?, trigger?, agent_notes? }',
          response: '201 { ok: true, tool: {...} }'
        },
        'PUT /api/tools/:id': {
          description: 'Update a tool manifest — partial update, only send fields to change',
          category: '工具管理',
          curl: 'curl -X PUT http://localhost:3099/api/tools/my-tool -H "Content-Type: application/json" -d \'{"category":"推理","description":"Updated description"}\'',
          body: 'JSON: any subset of writable fields (id cannot be changed). Fields: name, description, icon, version, category, order, port, ports, projectPath, url, startCommand, stopCommand, publicUrl, owner, apiBase, type, trigger, agent_notes, conflicts, children',
          response: '{ ok: true, tool: {...updated...} }'
        },
        'DELETE /api/tools/:id': {
          description: 'Delete a tool manifest and its directory. REQUIRES ?confirm=true',
          category: '工具管理',
          curl: 'curl -X DELETE "http://localhost:3099/api/tools/my-tool?confirm=true"',
          body: 'Query: confirm=true (required). Deletes entire ~/.agentboard/tools/{id}/ directory.',
          response: '{ ok: true, deleted: "my-tool" }',
          note: '红线操作——删除整个工具目录，不可逆。无 confirm=true 返回 400'
        },
        // ── 统计 Stats ──
        'GET /api/stats': {
          description: 'API call statistics — total calls, by caller (agent/browser), by action, top tools',
          category: '统计',
          curl: 'curl http://localhost:3099/api/stats',
          response: '{ ok: true, totalCalls, todayCalls, byCaller: {all, today}, byAction: {all, today}, byTool: [...] }'
        },
        // ── 联邦巡检 Loop Monitor ──
        'GET /api/loop/health': {
          description: 'Scan all loop projects for health.json status',
          category: '联邦巡检',
          curl: 'curl http://localhost:3099/api/loop/health',
          response: '{ projects: [...], updated: "ISO8601" }'
        },
        // ── 文件操作 ──
        'GET /api/open-folder': {
          description: 'Open a folder in Windows Explorer (?path= absolute path)',
          category: '文件操作',
          curl: 'curl "http://localhost:3099/api/open-folder?path=D:/workspace"',
          body: 'Query: path=<absolute path>. Only works within declared workspace roots.',
          response: '{ ok: true, path: "..." }'
        },
        'GET /open-dir/:name': {
          description: 'Open a skill directory in Explorer by name (e.g. /open-dir/perspective-router)',
          category: '文件操作',
          curl: 'curl http://localhost:3099/open-dir/perspective-router',
          body: 'Path param: :name = skill directory name under ~/.claude/skills/',
          response: '{ ok: true, path: "..." }'
        }
      },
      manifestSchema: {
        id: 'string — directory name under TOOLS_DIR (lowercase a-z 0-9 - _)',
        name: 'string — display name',
        description: 'string — 用途/何时用/何时不用/返回/延迟/端口 等',
        icon: 'string — emoji or single character',
        version: 'string — semver',
        category: 'string — 模型|Agent|设施|获取|查阅|创作|职能',
        order: 'number — sort order in dashboard grid',
        port: 'number — single port the tool listens on',
        ports: 'number[] — multiple ports',
        projectPath: 'string — working directory on disk',
        url: 'string — browser URL when running',
        startCommand: 'string — shell command to start the tool',
        stopCommand: 'string — shell command to stop the tool',
        publicUrl: 'string — public domain (e.g. https://gallery.evopearl.com/)',
        owner: 'string — 外部|自建|内部|AI托管|空=未标注',
        apiBase: 'string — API base URL for external services',
        type: 'string — service|cli|folder|group',
        trigger: 'string — CLI trigger string (shown on card)',
        agent_notes: 'string — AI 踩坑笔记 (DeepSeek 盲区/前置条件)',
        conflicts: 'string[] — conflicting tool IDs (GPU互斥/端口冲突)',
        children: 'array — sub-items for group-type tools'
      },
      tools: (function() { try { return scanTools(); } catch(e) { return []; } })(),
      toolsDir: TOOLS_DIR,
      skillsDir: SKILLS_DIR
    };
    if (req.headers.accept && req.headers.accept.indexOf('text/html') !== -1) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(apiHTML(data));
    } else {
      res.json(data);
    }
  });

  // --- Cron state proxy → scheduler :3100 ---
  app.get('/api/cron/state', function(req, res) {
    var opts = { hostname: '127.0.0.1', port: 3100, path: '/api/cron/state', method: 'GET', timeout: 5000 };
    var proxy = http.request(opts, function(upstream) {
      if (upstream.statusCode !== 200) {
        if (!res.headersSent) res.status(502).json({ ok: false, error: 'scheduler returned ' + upstream.statusCode });
        return;
      }
      var body = '';
      upstream.on('data', function(c) { body += c; });
      upstream.on('end', function() {
        if (!res.headersSent) { res.type('json'); res.send(body); }
      });
    });
    proxy.on('error', function() { if (!res.headersSent) res.json({ ok: false, error: 'scheduler unreachable' }); });
    proxy.on('timeout', function() { proxy.destroy(); if (!res.headersSent) res.json({ ok: false, error: 'scheduler timeout' }); });
    proxy.end();
  });

  // --- Tools API ---
  app.get('/api/tools', function(req, res) {
    var tools = scanTools();
    // Individual cron task cards suppressed — consolidated under cron-scheduler card
    res.json({ ok: true, tools: tools });
  });

  app.get('/api/tools/:id', function(req, res) {
    var tools = scanTools();
    var tool = null;
    for (var i = 0; i < tools.length; i++) {
      if (tools[i].id === req.params.id) { tool = tools[i]; break; }
    }
    if (!tool) return res.status(404).json({ ok: false, error: 'tool not found' });
    res.json({ ok: true, tool: tool });
  });

  app.post('/api/tools/start/:id', function(req, res) {
    var result = startTool(req.params.id);
    res.json(result);
  });

  app.post('/api/tools/stop/:id', function(req, res) {
    var result = stopTool(req.params.id);
    if (!result.ok) return res.status(500).json(result);
    res.json(result);
  });

  app.post('/api/tools/reorder', function(req, res) {
    var items = req.body && req.body.items;
    if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items array required' });
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var mfPath = findManifest(item.id);
      if (!mfPath) { results.push({ id: item.id, ok: false, error: 'not found' }); continue; }
      try {
        var mf = JSON.parse(read(mfPath));
        mf.order = item.order;
        fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
        results.push({ id: item.id, ok: true });
      } catch(e) {
        results.push({ id: item.id, ok: false, error: e.message });
      }
    }
    res.json({ ok: true, results: results });
  });

  // ── Manifest CRUD ──

  // Create a new tool manifest
  app.post('/api/tools', express.json(), function(req, res) {
    var result = createTool(req.body);
    if (!result.ok) {
      var status = result.error && result.error.indexOf('already exists') !== -1 ? 409 : 400;
      return res.status(status).json(result);
    }
    res.status(201).json(result);
  });

  // Update an existing tool manifest (partial update)
  app.put('/api/tools/:id', express.json(), function(req, res) {
    var result = updateTool(req.params.id, req.body);
    if (!result.ok) {
      var status = result.error && result.error.indexOf('not found') !== -1 ? 404 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  });

  // Delete a tool manifest (requires explicit confirmation)
  app.delete('/api/tools/:id', function(req, res) {
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ ok: false, error: 'Pass ?confirm=true to delete. This action removes the entire tool directory.' });
    }

    var mfPath = findManifest(req.params.id);
    if (!mfPath || !fs.existsSync(mfPath)) {
      return res.status(404).json({ ok: false, error: 'tool not found: ' + req.params.id });
    }

    var toolDir = path.dirname(mfPath);
    // Safety: only delete directories under TOOLS_DIR
    if (!toolDir.startsWith(path.resolve(TOOLS_DIR) + path.sep)) {
      return res.status(403).json({ ok: false, error: 'refusing to delete directory outside TOOLS_DIR' });
    }

    try {
      fs.rmSync(toolDir, { recursive: true, force: true });
      res.json({ ok: true, deleted: req.params.id });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Open skill folder in file explorer
  app.get('/open-dir/:name', function(req, res) {
    var name = req.params.name;
    // Validate: only allow perspective-* or known skill names
    if (!/^[a-zA-Z][-a-zA-Z0-9_.]*$/.test(name)) return res.status(400).send('invalid name');
    var dir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(dir)) return res.status(404).send('directory not found');
    var cmd = 'start "" "' + dir + '"';
    require('child_process').exec(cmd);
    res.json({ ok: true, path: dir });
  });

  // Catalog: Claude Code 能力目录 (技能 + 架构图 + 命令 + 全局宪法)
  app.get('/catalog', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var skills = scanAllSkills();
    var skillsBody = skillIndexHTML(skills);

    var diagrams = [];
    var seen = {};
    var dDirs = [LOCAL_SKILLS_DIR, SKILLS_DIR];
    dDirs.forEach(function(dir) {
      if (!fs.existsSync(dir)) return;
      listDirs(dir).forEach(function(name) {
        if (seen[name]) return;
        seen[name] = true;
        var fp = path.join(dir, name, 'references', 'system-diagram.html');
        if (!fs.existsSync(fp)) return;
        diagrams.push({ skill: name, file: 'system-diagram.html', displayName: getChineseName(name) });
      });
    });
    diagrams.sort(function(a, b) { return a.displayName.localeCompare(b.displayName, 'zh-CN'); });
    var diagCards = diagrams.map(function(d) {
      var words = d.skill.split(/[-_]/).filter(function(w) { return w.length > 0; });
      var mono = words.length >= 2 ? (words[0][0] + words[words.length-1][0]).toUpperCase() : d.skill.substring(0,2).toUpperCase();
      return '<a href="/skill-html/' + esc(d.skill) + '/system-diagram.html" class="diagram-card" target="_blank"><div class="card-mono">' + esc(mono) + '</div><div class="card-info"><div class="card-name">' + esc(d.displayName) + '</div><div class="card-sub">' + esc(d.skill) + '</div><div class="card-link">打开结构图 →</div></div></a>';
    }).join('\n');
    var diagBody = '<style>.diagram-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px;margin-top:8px}.diagram-card{background:var(--paper);padding:20px;display:flex;align-items:flex-start;gap:14px;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-border),var(--shadow-card);text-decoration:none;color:inherit}.diagram-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}.diagram-card .card-mono{flex-shrink:0;width:44px;height:44px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:14px;font-weight:500}.diagram-card .card-info{flex:1;min-width:0}.diagram-card .card-name{font-size:16px;font-weight:300;letter-spacing:-0.01em;line-height:1.35}.diagram-card .card-sub{font-size:11px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:1px}.diagram-card .card-link{font-size:11px;color:var(--ink);font-weight:500;margin-top:6px}</style><div class="diagram-grid">' + (diagCards || '<p>暂无架构图</p>') + '</div>';

    var cmdBody = commandsIndexHTML();

    var globalMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    var globalMd = read(globalMdPath) || '';
    var globalBody = globalMd ? '<div class="line-count">' + globalMd.split('\n').length + ' 行</div>' + renderMarkdown(globalMd) : '<p>CLAUDE.md 未找到</p>';

    var tabs = [
      { id: 'skills', label: '技能', meta: skills.length + '个' },
      { id: 'diagrams', label: '架构图', meta: diagrams.length + '张' },
      { id: 'commands', label: '命令', meta: BUILTIN_COMMANDS.length + '个' },
      { id: 'global', label: '全局宪法', meta: (globalMd ? globalMd.split('\n').length + '行' : '缺失') }
    ];

    var body = '<style>.tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:24px}.tab-btn{padding:10px 20px;font-size:13px;font-family:inherit;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;color:var(--text-muted);transition:color .15s,border-color .15s}.tab-btn:hover{color:var(--text)}.tab-btn.active{color:var(--ink);border-bottom-color:var(--ink);font-weight:500}.tab-btn .badge{font-size:10px;margin-left:6px;padding:1px 6px;border-radius:10px;background:var(--paper-tint);color:var(--text-muted)}.tab-btn.active .badge{background:rgba(var(--ink-rgb),0.1);color:var(--ink)}.tab-panel{display:none}.tab-panel.active{display:block}</style>\n' +
      '<div class="tabs">' + tabs.map(function(t, i) {
        return '<button class="tab-btn' + (i === 0 ? ' active' : '') + '" onclick="switchTab(\'' + t.id + '\',this)">' + esc(t.label) + '<span class="badge">' + t.meta + '</span></button>';
      }).join('') + '</div>\n' +
      '<div class="tab-panel active" id="tab-skills">' + skillsBody + '</div>\n' +
      '<div class="tab-panel" id="tab-diagrams">' + diagBody + '</div>\n' +
      '<div class="tab-panel" id="tab-commands">' + cmdBody + '</div>\n' +
      '<div class="tab-panel" id="tab-global">' + globalBody + '</div>\n' +
      '<script>function switchTab(id,btn){document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");document.querySelectorAll(".tab-panel").forEach(function(p){p.classList.remove("active")});document.getElementById("tab-"+id).classList.add("active");window.location.hash=id}</script>\n' +
      '<script>var h=window.location.hash.replace("#","");if(h){var b=document.querySelector(".tab-btn[onclick*=\'"+h+"\']");if(b)switchTab(h,b)}</script>';

    res.send(pageShell('能力目录', 'Claude Code 能力目录', body, 'catalog', null));
  });

  // Workspace sub-page — scan project directories
  function scanWorkspace(basePath) {
    if (!fs.existsSync(basePath)) return [];
    var projects = [];
    var entries = fs.readdirSync(basePath);
    entries.forEach(function(name) {
      var fullPath = path.join(basePath, name);
      var stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) return;
      if (name.startsWith('.') || name.startsWith('_')) return;
      if (name === 'node_modules') return;

      var meta = {};
      var raw = read(path.join(fullPath, '.project.json'));
      if (raw) { try { var parsed = JSON.parse(raw); if (parsed) meta = parsed; } catch(_) {} }
      var created = stat.birthtime;
      var daysAgo = Math.floor((Date.now() - created.getTime()) / 86400000);
      var recency = daysAgo <= 7 ? 'week' : (daysAgo <= 15 ? 'halfMonth' : (daysAgo <= 30 ? 'month' : 'older'));
      var recencyLabel = daysAgo <= 7 ? '7天内' : (daysAgo <= 15 ? '15天内' : (daysAgo <= 30 ? '30天内' : '超过30天'));

      var status = meta.status || 'undefined';
      var statusLabel = status === 'active' ? '活跃' : (status === 'archived' ? '已归档' : (status === 'abandoned' ? '已放弃' : '待定义'));
      var statusDot = status === 'active' ? 'on' : (status === 'archived' ? 'warn' : (status === 'abandoned' ? 'off' : 'none'));

      projects.push({
        dir: name,
        name: meta.name || name,
        description: meta.description || '',
        status: status,
        statusLabel: statusLabel,
        statusDot: statusDot,
        recency: recency,
        recencyLabel: recencyLabel,
        daysAgo: daysAgo
      });
    });

    var statusOrder = {active:0, undefined:1, archived:2, abandoned:3};
    projects.sort(function(a,b) {
      if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
    return projects;
  }

  function walkDir(dir, cb) {
    var entries = fs.readdirSync(dir);
    for (var i = 0; i < entries.length; i++) {
      var p = path.join(dir, entries[i]);
      try {
        var s = fs.statSync(p);
        if (s.isDirectory()) {
          if (entries[i] === 'node_modules' || entries[i] === '.git' || entries[i] === '_runtime') continue;
          walkDir(p, cb);
        } else { cb(p); }
      } catch(_) {}
    }
  }

  function workspaceHTML(projects, meta) {
    var catCounts = {all: projects.length};
    projects.forEach(function(p) {
      catCounts[p.status] = (catCounts[p.status] || 0) + 1;
      catCounts[p.recency] = (catCounts[p.recency] || 0) + 1;
    });

    var statusBar = '<div class="cat-bar-group"><span class="cat-bar-label">状态</span><div class="cat-bar" id="status-bar">' +
      '<button class="cat-pill active" data-filter="all" onclick="setFilter(\'all\')" title="显示所有状态">全部<span class="count">' + projects.length + '</span></button>' +
      '<button class="cat-pill" data-filter="active" onclick="setFilter(\'active\')" title="正在推进的项目">🟢 活跃<span class="count">' + (catCounts.active || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="archived" onclick="setFilter(\'archived\')" title="已完成或暂停，保留备查">🟡 已归档<span class="count">' + (catCounts.archived || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="abandoned" onclick="setFilter(\'abandoned\')" title="不再维护的项目">⚫ 已放弃<span class="count">' + (catCounts.abandoned || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="undefined" onclick="setFilter(\'undefined\')" title="尚未定义状态的项目">⚪ 待定义<span class="count">' + (catCounts.undefined || 0) + '</span></button>' +
      '</div></div>';

    var recencyBar = '<div class="cat-bar-group"><span class="cat-bar-label">时间</span><div class="cat-bar" id="recency-bar">' +
      '<button class="cat-pill" data-filter="all" onclick="setRecencyFilter(\'all\')" title="显示所有时间">全部<span class="count">' + projects.length + '</span></button>' +
      '<button class="cat-pill" data-filter="week" onclick="setRecencyFilter(\'week\')" title="最近7天内有文件修改">⏱ 7天内<span class="count">' + (catCounts.week || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="halfMonth" onclick="setRecencyFilter(\'halfMonth\')" title="最近15天内有文件修改">📅 15天内<span class="count">' + (catCounts.halfMonth || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="month" onclick="setRecencyFilter(\'month\')" title="最近30天内有文件修改">🗓 30天内<span class="count">' + (catCounts.month || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="older" onclick="setRecencyFilter(\'older\')" title="超过30天未修改">🏛 超过30天<span class="count">' + (catCounts.older || 0) + '</span></button>' +
      '</div></div>';

    var cards = projects.map(function(p) {
      var daysText = p.daysAgo === 0 ? '今天' : (p.daysAgo + '天前');
      return '<div class="proj-card" data-status="' + p.status + '" data-recency="' + p.recency + '">' +
        '<div class="card-body">' +
          '<div class="card-mono">' + esc(monogram(p.name)) + '</div>' +
          '<div class="card-info">' +
            '<div class="card-name">' +
              '<span class="status-dot ' + p.statusDot + '"></span>' +
              esc(p.name) +
              '<span class="status-tag tag-' + p.status + '">' + p.statusLabel + '</span>' +
            '</div>' +
            '<div class="card-dir">' + esc(p.dir) + '</div>' +
            (p.description ? '<div class="card-desc">' + esc(p.description) + '</div>' : '<div class="card-desc" style="color:var(--text-muted);font-style:italic">暂无简介 · 添加 .project.json 描述此项目</div>') +
            '<div class="card-meta">' +
              '<span class="recency-badge badge-' + p.recency + '">' + p.recencyLabel + ' · ' + daysText + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="btn go" onclick="fetch(\'/workspace/' + encodeURIComponent(meta.id) + '/' + encodeURIComponent(p.dir) + '\')">打开文件夹</button>' +
        '</div>' +
      '</div>';
    }).join('\n');

    return '<style>\n' +
      '.cat-bar-group{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}\n' +
      '.cat-bar-label{font-size:11px;font-weight:500;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);letter-spacing:.05em;min-width:32px;flex-shrink:0}\n' +
      '.cat-bar{display:flex;flex-wrap:wrap;gap:6px;flex:1}\n' +
      '.cat-bar .cat-pill{flex:1;min-width:80px;justify-content:center;padding:5px 12px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}\n' +
      '.cat-bar .cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
      '.proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:12px;margin-top:8px}\n' +
      '.proj-card{background:var(--paper);padding:20px;display:flex;flex-direction:column;gap:6px;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.proj-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.card-body{display:flex;align-items:flex-start;gap:12px;flex:1}\n' +
      '.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:13px;font-weight:500}\n' +
      '.card-info{flex:1;min-width:0}\n' +
      '.card-name{font-size:15px;font-weight:400;letter-spacing:-0.01em;line-height:1.4;display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n' +
      '.card-dir{font-size:10px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:1px}\n' +
      '.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px}\n' +
      '.card-meta{margin-top:4px}\n' +
      '.card-actions{margin-top:4px}\n' +
      '.status-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%}\n' +
      '.status-dot.on{background:var(--status-on);animation:pulse 2s ease-in-out infinite}\n' +
      '.status-dot.warn{background:#D97706}\n' +
      '.status-dot.off{background:var(--status-off)}\n' +
      '.status-dot.none{background:var(--border)}\n' +
      '.status-tag{font-size:10px;padding:1px 6px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
      '.tag-active{color:var(--status-on);background:rgba(26,138,63,.08)}\n' +
      '.tag-archived{color:#D97706;background:rgba(217,119,6,.08)}\n' +
      '.tag-abandoned{color:var(--text-muted);background:rgba(153,153,153,.08)}\n' +
      '.tag-undefined{color:var(--text-muted);background:var(--paper-tint)}\n' +
      '.recency-badge{font-size:10px;padding:1px 6px;font-weight:400}\n' +
      '.badge-week{color:#1A8A3F;background:rgba(26,138,63,.08)}\n' +
      '.badge-halfMonth{color:#8B5CF6;background:rgba(139,92,246,.08)}\n' +
      '.badge-month{color:#D97706;background:rgba(217,119,6,.08)}\n' +
      '.badge-older{color:var(--text-muted);background:var(--paper-tint)}\n' +
      '.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
      '.back-link:hover{border-color:var(--ink);color:var(--ink)}\n' +
      '.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--ink);margin-bottom:4px}\n' +
      '.page .ws-subtitle{font-size:13px;color:var(--text-muted);font-weight:300;margin-bottom:20px;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
    '</style>\n' +
    '<h1>' + esc(meta.name) + '</h1>\n' +
    '<div class="ws-subtitle">' + esc(meta.projectPath) + ' · ' + projects.length + ' 个子项目</div>\n' +
    statusBar + recencyBar +
    '<div class="proj-grid">' + cards + '</div>' +
    '<script>\n' +
    'var currentStatus = "all"; var currentRecency = "all";\n' +
    'function applyFilters() {\n' +
    '  document.querySelectorAll(".proj-card").forEach(function(c) {\n' +
    '    var s = currentStatus === "all" || c.dataset.status === currentStatus;\n' +
    '    var r = currentRecency === "all" || c.dataset.recency === currentRecency;\n' +
    '    c.style.display = (s && r) ? "flex" : "none";\n' +
    '  });\n' +
    '}\n' +
    'function setFilter(t) {\n' +
    '  currentStatus = t;\n' +
    '  document.querySelectorAll("#status-bar .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}\n' +
    'function setRecencyFilter(t) {\n' +
    '  currentRecency = t;\n' +
    '  document.querySelectorAll("#recency-bar .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}' +
    '<\/script>';

    // Also serve /open-dir for workspace subdirs via existing /open-dir route
  }

  // Multi-section info page for tools that have files, not sub-projects
  function toolInfoHTML(meta) {
    var pp = meta.projectPath.replace(/%([^%]+)%/g, function(_, n){ return process.env[n] || '%'+n+'%'; });
    var whitelist = meta.whitelist || [];
    var architecture = meta.architecture || '';

    // ── CSS ──
    var style = '<style>\n' +
      '.info-section{margin-top:36px}\n' +
      '.info-section h2{font-size:18px;font-weight:500;color:var(--text);margin-bottom:12px;padding-top:16px;border-top:1px solid var(--border)}\n' +
      '.sig-table{width:100%;border-collapse:collapse;font-size:13px}\n' +
      '.sig-table th{text-align:left;padding:8px 12px;background:var(--paper-tint);font-weight:500;font-size:12px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-secondary);border:1px solid var(--border)}\n' +
      '.sig-table td{padding:8px 12px;border:1px solid var(--border);vertical-align:top;line-height:1.6}\n' +
      '.sig-table .sig-symptom{font-weight:500;color:var(--text);font-size:14px}\n' +
      '.sig-table .sig-cause{color:var(--text-secondary);font-size:13px}\n' +
      '.wl-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:12px;margin-top:8px}\n' +
      '.wl-card{background:var(--paper);padding:20px;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.wl-card .wl-name{font-size:15px;font-weight:500;margin-bottom:8px}\n' +
      '.wl-card .wl-domains{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px;color:var(--text-muted);line-height:1.8;word-break:break-all}\n' +
      '.wl-card .wl-meta{font-size:11px;color:var(--text-muted);margin-top:8px;font-family:"Cascadia Code","Consolas","SF Mono",monospace}\n' +
      '.fix-steps{font-size:14px;line-height:2;color:var(--text-secondary);padding-left:20px}\n' +
      '.fix-steps li{margin-bottom:4px}\n' +
      '.fix-steps code{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;background:var(--paper-tint);padding:1px 5px}\n' +
      '.arch-block{font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;line-height:1.8;color:var(--text-secondary);background:var(--paper-tint);padding:16px 20px;white-space:pre-wrap}\n' +
      '.proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:10px;margin-top:8px}\n' +
      '.proj-card{background:var(--paper);padding:16px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.proj-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.card-body{display:flex;align-items:flex-start;gap:10px;flex:1}\n' +
      '.card-mono{flex-shrink:0;width:36px;height:36px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px;font-weight:500}\n' +
      '.card-info{flex:1;min-width:0}\n' +
      '.card-name{font-size:13px;font-weight:400;line-height:1.4}\n' +
      '.card-dir{font-size:10px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:2px}\n' +
      '.card-actions{margin-top:4px}\n' +
      '.btn{display:inline-block;padding:4px 10px;font-size:11px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;border:1px solid var(--border);background:var(--paper-tint);color:var(--text-secondary);cursor:pointer;text-decoration:none;transition:all .12s}\n' +
      '.btn.go{border-color:var(--ink);color:var(--ink)}\n' +
      '.btn:hover{background:var(--ink);color:var(--paper);border-color:var(--ink)}\n' +
    '<\/style>\n';

    // ── 1. 故障信号 ──
    var signalsHTML = '<div class="info-section">\n<h2>⚡ 故障信号</h2>\n';
    if (whitelist.length > 0) {
      signalsHTML += '<table class="sig-table"><thead><tr><th style="width:35%">症状</th><th>根因</th></tr></thead><tbody>';
      whitelist.forEach(function(w) {
        signalsHTML += '<tr><td class="sig-symptom">' + esc(w.symptom) + '</td>' +
          '<td class="sig-cause">SakuraCat 推送覆盖了 fake-ip-filter，<code>' + esc(w.domains[0]) + '</code> 等域名 DNS 被劫持到 198.18.0.1/16 假 IP，直连失败</td></tr>';
      });
      signalsHTML += '<tr><td class="sig-symptom" style="color:var(--text-muted)">其他国内服务突然不通</td>' +
        '<td class="sig-cause">同上 —— 查目标域名是否已在下方白名单中，不在就补上</td></tr>';
      signalsHTML += '</tbody></table>';
    } else {
      signalsHTML += '<p style="color:var(--text-muted)">暂无记录。新服务断连后添加到白名单。</p>';
    }
    signalsHTML += '</div>\n';

    // ── 2. 白名单注册表 ──
    var wlHTML = '<div class="info-section">\n<h2>📋 白名单注册表 <span style="font-weight:300;font-size:13px;color:var(--text-muted)">(fake-ip-filter)</span></h2>\n';
    if (whitelist.length > 0) {
      wlHTML += '<div class="wl-grid">';
      whitelist.forEach(function(w) {
        var domainsJoined = w.domains.join(', ');
        wlHTML += '<div class="wl-card">' +
          '<div class="wl-name">' + esc(w.service) + '</div>' +
          '<div class="wl-domains">' + esc(domainsJoined) + '</div>' +
          '<div class="wl-meta">添加于 ' + esc(w.since) + '</div>' +
        '</div>';
      });
      wlHTML += '</div>';
    }
    wlHTML += '<p style="margin-top:12px;font-size:12px;color:var(--text-muted)">新增服务：编辑此工具的 <code>manifest.json</code> → <code>whitelist</code> 数组，追加新条目。下次断连时这里就是检查清单。</p>';
    wlHTML += '</div>\n';

    // ── 3. 修复步骤 ──
    var fixSteps = meta.fix_steps;
    var fixHTML = '<div class="info-section">\n<h2>🔧 修复步骤</h2>\n';
    if (fixSteps && fixSteps.length > 0) {
      fixHTML += '<ol class="fix-steps">';
      fixSteps.forEach(function(s) {
        fixHTML += '<li>' + esc(s.text);
        if (s.code) {
          fixHTML += '<br><pre><code>' + esc(s.code) + '</code></pre>';
        }
        fixHTML += '</li>';
      });
      fixHTML += '</ol>';
    } else {
      fixHTML += '<ol class="fix-steps">' +
        '<li>打开 <code>' + esc(pp) + '\\config.yaml</code>，搜目标域名，不在 <code>fake-ip-filter</code> 中就补上（参考上方白名单的域名列表）</li>' +
        '<li>关 SakuraCat → 删同目录 <code>cache.db</code></li>' +
        '<li>重启 SakuraCat</li>' +
        '<li>验证：<code>nslookup &lt;目标域名&gt; 127.0.0.1</code> 应返回真实 IP 而非 198.18.x.x</li>' +
      '</ol>';
    }
    fixHTML += '</div>\n';

    // ── 3.5. 已知踩坑 ──
    var pitfalls = meta.pitfalls;
    if (pitfalls && pitfalls.length > 0) {
      fixHTML += '<div class="info-section">\n<h2>⚠️ 已知踩坑</h2>\n';
      pitfalls.forEach(function(p) {
        fixHTML += '<div style="margin-bottom:16px">' +
          '<strong style="color:var(--text)">' + esc(p.title) + '</strong>' +
          '<p style="margin:4px 0;font-size:13px;color:var(--text-secondary)">' + esc(p.problem) + '</p>' +
          '<p style="margin:4px 0;font-size:13px;color:var(--text-secondary)">✅ ' + esc(p.fix) + '</p>' +
        '</div>';
      });
      fixHTML += '</div>\n';
    }

    // ── 4. 配置文件 ──
    var filesHTML = '<div class="info-section">\n<h2>🗂 配置文件</h2>\n';
    if (fs.existsSync(pp)) {
      var entries = fs.readdirSync(pp, { withFileTypes: true });
      var dirs = entries.filter(function(e) { return e.isDirectory() && !e.name.startsWith('.'); });
      var fileList = entries.filter(function(e) { return e.isFile(); })
        .map(function(f) { var s = fs.statSync(path.join(pp, f.name)); return { name: f.name, size: s.size, mtime: s.mtime }; })
        .sort(function(a, b) { return b.mtime - a.mtime; });

      var fcards = '';
      dirs.forEach(function(d) {
        fcards += '<div class="proj-card">' +
          '<div class="card-body">' +
            '<div class="card-mono">' + esc(d.name.substring(0, 2).toUpperCase()) + '</div>' +
            '<div class="card-info">' +
              '<div class="card-name">📁 ' + esc(d.name) + '</div>' +
              '<div class="card-dir">' + esc(path.join(pp, d.name)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn go" onclick="fetch(\'/workspace/' + encodeURIComponent(meta.id) + '/' + encodeURIComponent(d.name) + '\').then(function(){location.reload()})">在资源管理器打开</button>' +
          '</div>' +
        '</div>';
      });
      fileList.forEach(function(f) {
        var sizeText = f.size < 1024 ? f.size + ' B' : (f.size < 1048576 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB');
        var daysAgo = Math.floor((Date.now() - f.mtime.getTime()) / 86400000);
        var mtimeText = daysAgo === 0 ? '今天' : daysAgo + '天前';
        var ext = f.name.split('.').pop().toUpperCase().substring(0, 3);
        fcards += '<div class="proj-card">' +
          '<div class="card-body">' +
            '<div class="card-mono">' + esc(ext) + '</div>' +
            '<div class="card-info">' +
              '<div class="card-name">' + esc(f.name) + '</div>' +
              '<div class="card-dir">' + sizeText + ' · ' + mtimeText + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      filesHTML += '<div class="proj-grid">' + fcards + '</div>';
    } else {
      filesHTML += '<p style="color:var(--text-muted)">目录不存在: ' + esc(pp) + '</p>';
    }
    filesHTML += '</div>\n';

    // ── 5. 代理架构 ──
    var archHTML = '<div class="info-section">\n<h2>🏗 代理架构</h2>\n';
    if (architecture) {
      archHTML += '<div class="arch-block">' + esc(architecture) + '</div>';
    }
    archHTML += '</div>\n';

    return style +
      '<h1>' + esc(meta.name) + '</h1>' +
      '<div class="ws-subtitle">' + esc(pp) + '</div>' +
      signalsHTML + wlHTML + fixHTML + filesHTML + archHTML;
  }

  // Workspace sub-page
  app.get('/workspace/:id', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var mfPath = findManifest(req.params.id);
    if (!mfPath) return res.status(404).send('找不到工作区');
    var mf = JSON.parse(read(mfPath));
    if (!mf.projectPath) return res.status(400).send('该工具不是工作区');
    var projects = scanWorkspace(mf.projectPath);
    var body = projects.length > 0 ? workspaceHTML(projects, mf) : toolInfoHTML(mf);
    res.send(pageShell(mf.name, mf.projectPath, body, 'workspace', projects.length + ' 个子项目'));
  });

  // Open workspace sub-directory
  app.get('/workspace/:id/:subdir', function(req, res) {
    var mfPath = findManifest(req.params.id);
    if (!mfPath) return res.status(404).send('not found');
    var mf = JSON.parse(read(mfPath));
    if (!mf.projectPath) return res.status(400).send('not a workspace');
    var dir = path.join(mf.projectPath, req.params.subdir);
    if (!fs.existsSync(dir)) return res.status(404).send('directory not found');
    openFolder(dir);
    res.json({ok:true,opened:dir});
  });

  // Individual skill system-diagram
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

  // Serve individual HTML from skill references/
  app.get('/skill-html/:skill/:file', function(req, res) {
    var fp = safeResolve(SKILLS_DIR, req.params.skill, 'references', req.params.file);
    if (!fp || !fs.existsSync(fp)) { fp = safeResolve(LOCAL_SKILLS_DIR, req.params.skill, 'references', req.params.file); }
    if (!fp || !fs.existsSync(fp)) return res.status(404).send('not found');
    res.type('html').send(read(fp));
  });

  // Tips (操作日志)
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

      var tipType = '';
      var typeMatch = md.match(/^type:\s*(.+)/m);
      if (typeMatch) tipType = typeMatch[1];

      return { title: title, desc: desc, body: md, type: tipType };
    }

    app.get('/tips', function(req, res) {
      var files = fs.readdirSync(TIPS_DIR).filter(function(f) { return f.endsWith('.md') && f !== 'CONSTITUTION.md'; }).sort();
      var items = files.map(function(f) {
        var tip = parseTipFile(path.join(TIPS_DIR, f));
        return tip ? { file: f, title: tip.title, desc: tip.desc, type: tip.type || 'diagnosis' } : null;
      }).filter(Boolean);

      var typeMeta = {
        diagnosis: { label: '诊断', tip: '为什么X会这样？因果链路追踪' },
        method: { label: '方法', tip: '怎么做X？可执行的步骤序列' },
        fact: { label: '事实', tip: 'X在哪/是什么？路径、版本、架构等具体数据' }
      };
      var typeLabels = { diagnosis: 'DX', method: 'MT', fact: 'FT' };

      var cats = {};
      items.forEach(function(item) { var t = item.type || 'reference'; cats[t] = (cats[t] || 0) + 1; });

      var allCount = items.length;

      var cardsHtml = items.map(function(item) {
        var words = item.title.replace(/[^一-鿿a-zA-Z]/g, ' ').split(/\s+/).filter(function(w) { return w.length > 0; });
        var mono = words.length >= 2
          ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
          : item.title.substring(0, 2).toUpperCase();
        var tp = item.type || 'reference';
        return '<div class="card-wrap" data-tip="' + item.file + '" data-type="' + tp + '">' +
          '<a href="/tips/' + encodeURIComponent(item.file) + '" target="_blank" class="card">' +
            '<span class="card-grip" draggable="true">⋮⋮</span>' +
            '<div class="card-mono">' + esc(mono) + '</div>' +
            '<div class="card-body">' +
              '<div class="card-name">' + esc(item.title) + '</div>' +
              (item.desc ? '<div class="card-sub">' + esc(item.desc) + '</div>' : '') +
              '<span class="card-type-tag tag-' + tp + '">' + (typeLabels[tp] || tp) + '</span>' +
            '</div>' +
          '</a>' +
        '</div>';
      }).join('\n');

      var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>操作日志 · Tips</title>\n' +
        '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">TP</text></svg>') + '">\n' +
        '<style>\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:Inter,"Microsoft YaHei UI","Noto Sans SC",sans-serif;background:#FAFAF8;color:#0A0A0A;min-height:100vh;font-weight:300;font-size:16px}\n' +
        '  .hero{background:#002FA7;color:#FAFAF8;padding:56px 32px 48px}\n' +
        '  .hero-inner{max-width:1080px;margin:0 auto}\n' +
        '  .hero-mono{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
        '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
        '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:520px;letter-spacing:-0.01em}\n' +
        '  .content{margin:0 auto;padding:6px 32px 32px}\n' +
        '  .cat-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}\n' +
        '  .cat-pill{padding:6px 14px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;letter-spacing:.03em;background:#F0F0EC;border:1px solid #E0E0DC;color:#555;cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:6px}\n' +
        '  .cat-pill:hover{background:#E4E4DE;color:#0A0A0A}\n' +
        '  .cat-pill.active{background:#002FA7;border-color:#002FA7;color:#FAFAF8}\n' +
        '  .cat-pill .count{font-size:10px;opacity:.7}\n' +
        '  .grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start}\n' +
        '  .card-wrap{flex:0 0 480px;position:relative;user-select:text;-webkit-user-select:text}\n' +
        '  .card-wrap.hidden-card{display:none}\n' +
        '  .card-wrap.dragging{opacity:.35}\n' +
        '  .card-wrap.drag-over::before{content:"";position:absolute;inset:0;border:2px solid #002FA7;z-index:2;pointer-events:none}\n' +
        '  .card{display:flex;align-items:flex-start;gap:28px;background:#FAFAF8;padding:22px 28px;text-decoration:none;color:inherit;transition:background .15s,box-shadow .15s;height:180px;overflow:hidden;border:1px solid #E0E0DC;box-shadow:0 1px 3px rgba(0,0,0,.06);position:relative}\n' +
        '  .card:hover{background:#F0F0EC}\n' +
        '  .card-grip{position:absolute;top:12px;right:12px;color:#B0B0AC;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1}\n' +
        '  .card-grip:active{cursor:grabbing}\n' +
        '  .card-mono{flex-shrink:0;width:52px;height:52px;background:#002FA7;color:#FAFAF8;display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
        '  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0;position:relative}\n' +
        '  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em}\n' +
        '  .card-sub{font-size:13px;font-weight:300;color:#555;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
        '  .card-type-tag{position:absolute;bottom:2px;right:0;font-size:9px;font-weight:500;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;letter-spacing:.04em;padding:2px 6px;opacity:.55}\n' +
        '  .tag-diagnosis{color:#002FA7;background:rgba(0,47,167,.06)}\n' +
        '  .tag-method{color:#1A8A3F;background:rgba(26,138,63,.06)}\n' +
        '  .tag-fact{color:#666;background:rgba(0,0,0,.05)}\n' +
        '  .footer{max-width:1080px;margin:0 auto;padding:36px 32px;border-top:1px solid #E0E0DC}\n' +
        '  .phil-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:#E0E0DC;margin-bottom:0}\n' +
        '  .phil-card{background:#FAFAF8;padding:24px 20px}\n' +
        '  .phil-num{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;color:#002FA7;opacity:.45;margin-bottom:10px;letter-spacing:.04em}\n' +
        '  .phil-title{font-size:15px;font-weight:500;color:#0A0A0A;margin-bottom:6px;letter-spacing:-0.01em;line-height:1.4}\n' +
        '  .phil-body{font-size:12px;font-weight:300;color:#555;line-height:1.6}\n' +
        '  .phil-body strong{font-weight:500;color:#0A0A0A}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a><div class="hero-mono" style="margin-top:10px">OPERATIONS LOG</div><h1>操作日志</h1><div class="tagline">人+AI 共享操作记录。踩坑即记，分类即检索。</div></div></div>\n' +
        '<div class="content">\n' +
        '<div class="cat-bar" id="catBar">' +
          '<button class="cat-pill active" data-type="all" onclick="setTipFilter(\'all\')">全部<span class="count">' + allCount + '</span></button>' +
          Object.keys(typeMeta).map(function(t) {
            if (!cats[t]) return '';
            return '<button class="cat-pill" data-type="' + t + '" onclick="setTipFilter(\'' + t + '\')">' + typeMeta[t].label + '<span class="count">' + (cats[t] || 0) + '</span></button>';
          }).join('') +
        '</div>\n' +
        '<div class="grid">' + cardsHtml + '</div></div>\n' +
        '<div class="footer">\n' +
        '  <div class="phil-grid">\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">01</div>\n' +
        '      <div class="phil-title">踩坑即记录</div>\n' +
        '      <div class="phil-body">遇到坑立刻写，不等"完美的笔记"。<strong>半成品笔记 > 没写的记录。</strong>文件落盘即上线。</div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">02</div>\n' +
        '      <div class="phil-title">分类找得着</div>\n' +
        '      <div class="phil-body">diagnosis / method / fact 三种类型。<strong>翻不动的那天，就是该分类的那天。</strong></div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">03</div>\n' +
        '      <div class="phil-title">人+AI 共享</div>\n' +
        '      <div class="phil-body">人发现坑，人+AI 一起写笔记。<strong>AI 不踩坑，但 AI 擅长结构化复盘。</strong>每个 tip 是互操作产物。</div>\n' +
        '    </div>\n' +
        '    <div class="phil-card">\n' +
        '      <div class="phil-num">04</div>\n' +
        '      <div class="phil-title">单一真相源</div>\n' +
        '      <div class="phil-body"><strong>~/.agentboard/tips/ 是唯一位置。</strong>不重复存 memory，不复制到项目。agentboard 直接渲染。</div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>\n' +
        '<div style="max-width:1080px;margin:0 auto;padding:0 32px 24px;font-size:11px;opacity:.35;font-family:\"Cascadia Code\",\"Consolas\",\"SF Mono\",monospace">\n' +
        '  <a href="/tips/CONSTITUTION.md" style="color:inherit">写入标准 → CONSTITUTION.md</a>（五问 &middot; 格式 &middot; 分类）\n' +
        '</div>\n' +
        '<script>\n' +
        'var tipFilter="all";\n' +
        'function setTipFilter(t){\n' +
        '  tipFilter=t;\n' +
        '  document.querySelectorAll(".cat-pill").forEach(function(p){p.classList.remove("active");});\n' +
        '  document.querySelectorAll(".cat-pill").forEach(function(p){if(p.dataset.type===tipFilter)p.classList.add("active");});\n' +
        '  document.querySelectorAll(".card-wrap").forEach(function(c){\n' +
        '    if(tipFilter==="all"||c.dataset.type===tipFilter){c.classList.remove("hidden-card");}\n' +
        '    else{c.classList.add("hidden-card");}\n' +
        '  });\n' +
        '}\n' +
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
        '  .hero a{color:inherit;text-decoration:none;font-size:13px;font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;opacity:.6;letter-spacing:.04em}\n' +
        '  .hero a:hover{opacity:1}\n' +
        '  .hero h1{font-size:min(2.8vw,3.6vh);font-weight:200;letter-spacing:-0.02em;line-height:1.2;margin-top:8px}\n' +
        '  .content{max-width:720px;margin:0 auto;padding:32px}\n' +
        '  .content h2{font-size:20px;font-weight:400;margin:32px 0 10px;color:#0A0A0A;letter-spacing:-0.01em}\n' +
        '  .content h3{font-size:17px;font-weight:400;margin:24px 0 8px;color:#333}\n' +
        '  .content p{margin:8px 0;color:#333}\n' +
        '  .content ul{margin:8px 0;padding-left:24px}\n' +
        '  .content li{margin:4px 0;color:#333;font-size:15px}\n' +
        '  .content code{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:13px;background:#F0F0EC;padding:1px 6px}\n' +
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


  app.get('/api/stats', function(req, res) {
    var now = new Date();
    var today = now.toISOString().slice(0, 10);

    // aggregates
    var total = apiLog.length;
    var byCaller = { agent: 0, browser: 0, unknown: 0 };
    var byAction = { list: 0, detail: 0, control: 0, admin: 0 };
    var byTool = {}; // { toolId: calls }
    var todayByCaller = { agent: 0, browser: 0, unknown: 0 };
    var todayByAction = { list: 0, detail: 0, control: 0, admin: 0 };
    var todayCount = 0;

    for (var i = 0; i < apiLog.length; i++) {
      var e = apiLog[i];
      var c = e.caller || 'unknown';
      var a = e.action || 'admin';
      if (byCaller.hasOwnProperty(c)) byCaller[c]++; else byCaller[c] = 1;
      byAction[a] = (byAction[a]||0) + 1;
      if (e.target) byTool[e.target] = (byTool[e.target]||0) + 1;

      if ((e.ts||'').slice(0,10) === today) {
        todayCount++;
        if (todayByCaller.hasOwnProperty(c)) todayByCaller[c]++; else todayByCaller[c] = 1;
        todayByAction[a] = (todayByAction[a]||0) + 1;
      }
    }

    // sort tools by call count desc, top 10
    var toolRank = Object.keys(byTool).sort(function(a,b){ return byTool[b] - byTool[a]; }).slice(0,10).map(function(k){ return { id: k, calls: byTool[k] }; });

    res.json({
      ok: true,
      since: apiLog.length ? apiLog[0].ts : null,
      totalCalls: total,
      todayCalls: todayCount,
      byCaller: { all: byCaller, today: todayByCaller },
      byAction: { all: byAction, today: todayByAction },
      byTool: toolRank,
      // backward compat
      byEndpoint: apiCounts
    });
  });

  // Registry page: tabs for startup items + static docs
  app.get('/registry', function(req, res) {
    // --- Startup items ---
    var toolLookup = {};
    try {
      var allTools = scanTools();
      allTools.forEach(function(t) {
        var key = t.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        toolLookup[key] = { name: t.name, desc: (t.description || '').split('【')[0].trim() };
      });
    } catch(_) {}
    var manualMeta = {
      'agentboard':       { name: 'Agentboard 服务',  desc: '工具架后台服务 (端口 3099)', group: '核心服务' },
      'start-agentboard': { name: 'Agentboard 启动器', desc: '开机时启动工具架服务', group: '核心服务' },
      'claude-startup':   { name: 'Claude 自启动',    desc: '启动 Claude Code 终端', group: '核心服务' },
      'lark-channel-bridge': { name: '飞书通道桥接',  desc: '飞书消息 ↔ Agent 双向桥接', group: '通道' },
      'pm2-resurrect':    { name: 'PM2 进程恢复',     desc: '恢复上次的 PM2 进程列表', group: '核心服务' },
      'launch':           { name: 'Agentboard 启动器', desc: 'Agentboard 备用启动脚本', group: '核心服务' },
      'Snap':             { name: 'Snap 截图',         desc: '截图小工具', group: '工具' },
      'Snipaste':         { name: 'Snipaste',          desc: '截图贴图工具', group: '工具' },
      'paseo-daemon':     { name: 'Paseo 远程Agent编排', desc: '手机遥控桌面 Claude Code 的 Agent 编排服务 (:6767)', group: '核心服务' },
      'tailscale-ensure': { name: 'Tailscale 组网隧道', desc: 'WireGuard 加密组网，手机和桌面在同一虚拟局域网', group: '核心服务' }
    };
    var groupOrder = { '核心服务': 0, '通道': 1, 'Agent': 2, '工具': 3, '其他': 9 };
    var startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    var items = [];
    try {
      var files = fs.readdirSync(startupDir);
      files.forEach(function(f) {
        if (f === 'desktop.ini') return;
        var fp = path.join(startupDir, f);
        var stat = fs.statSync(fp);
        var rawName = f.replace(/\.(lnk|bat|vbs|ps1|cmd)$/i, '');
        var key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        var meta = manualMeta[rawName] || toolLookup[key] || null;
        var group = (meta && meta.group) ? meta.group : '其他';
        items.push({
          name: rawName,
          displayName: (meta && meta.name) ? meta.name : rawName,
          desc: (meta && meta.desc) ? meta.desc : '',
          group: group,
          file: f, path: fp, source: '启动文件夹', size: stat.size, mtime: stat.mtime.toISOString()
        });
      });
    } catch(_) {}
    try {
      var abs = ['.bat', '.vbs', '.ps1'];
      var agentFiles = fs.readdirSync(PROJECT_DIR).filter(function(f) { return abs.indexOf(path.extname(f).toLowerCase()) !== -1; });
      agentFiles.forEach(function(f) {
        var fp = path.join(PROJECT_DIR, f);
        var stat = fs.statSync(fp);
        var rawName = f.replace(/\.(bat|vbs|ps1)$/i, '');
        var key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        var meta = manualMeta[rawName] || toolLookup[key] || null;
        var group = (meta && meta.group) ? meta.group : '其他';
        items.push({
          name: rawName,
          displayName: (meta && meta.name) ? meta.name : rawName,
          desc: (meta && meta.desc) ? meta.desc : '',
          group: group,
          file: f, path: fp, source: 'Agentboard', size: stat.size, mtime: stat.mtime.toISOString()
        });
      });
    } catch(_) {}
    items.sort(function(a, b) {
      var ga = groupOrder[a.group] != null ? groupOrder[a.group] : 9;
      var gb = groupOrder[b.group] != null ? groupOrder[b.group] : 9;
      if (ga !== gb) return ga - gb;
      return a.displayName.localeCompare(b.displayName, 'zh-CN');
    });
    var startupRows = items.map(function(item) {
      var ext = path.extname(item.file).toLowerCase();
      var typeLabel = ext === '.lnk' ? '快捷方式' : ext === '.bat' ? '批处理' : ext === '.vbs' ? 'VBScript' : ext === '.ps1' ? 'PowerShell' : ext === '.cmd' ? 'CMD' : '文件';
      var descCell = item.desc ? '<td style="font-size:11px;color:var(--text-muted);max-width:280px">' + esc(item.desc) + '</td>' : '<td></td>';
      return '<tr><td><strong>' + esc(item.displayName) + '</strong><br><span style="font-size:10px;color:var(--text-muted)">' + esc(item.name) + '</span></td>' + descCell + '<td><code>' + typeLabel + '</code></td><td style="font-size:11px;color:var(--text-muted)">' + esc(item.source) + '</td><td style="font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:11px">' + esc(item.file) + '</td></tr>';
    }).join('');
    var startupHtml = '<p class="sub">开机自启动的应用和脚本。添加：把 .bat/.vbs 快捷方式放入 <code>Startup</code> 文件夹。Agentboard 启动脚本放 <code>~/.agentboard/</code>。</p>' +
      (items.length ? '<table><tr><th>名称</th><th>简介</th><th>类型</th><th>来源</th><th>文件</th></tr>' + startupRows + '</table>' : '<p>暂无启动项</p>');

    // --- Static docs ---
    var designMd = read(path.join(PROJECT_DIR, 'design-spec.md')) || '';
    var repoMd = read(path.join(PROJECT_DIR, 'repo-spec.md')) || '';

    var tabs = [
      { id: 'startup', label: '自启动', meta: items.length + '项' },
      { id: 'design', label: '设计规范', meta: (designMd ? designMd.split('\n').length + '行' : '缺失') },
      { id: 'repo', label: '工程规范', meta: (repoMd ? repoMd.split('\n').length + '行' : '缺失') }
    ];

    var body = '<style>.tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:24px}.tab-btn{padding:10px 20px;font-size:13px;font-family:inherit;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;color:var(--text-muted);transition:color .15s,border-color .15s}.tab-btn:hover{color:var(--text)}.tab-btn.active{color:var(--ink);border-bottom-color:var(--ink);font-weight:500}.tab-btn .badge{font-size:10px;margin-left:6px;padding:1px 6px;border-radius:10px;background:var(--paper-tint);color:var(--text-muted)}.tab-btn.active .badge{background:rgba(var(--ink-rgb),0.1);color:var(--ink)}.tab-panel{display:none}.tab-panel.active{display:block}</style>\n' +
      '<div class="tabs">' + tabs.map(function(t, i) {
        return '<button class="tab-btn' + (i === 0 ? ' active' : '') + '" onclick="switchTab(\'' + t.id + '\',this)">' + esc(t.label) + '<span class="badge">' + t.meta + '</span></button>';
      }).join('') + '</div>\n' +
      '<div class="tab-panel active" id="tab-startup">' + startupHtml + '</div>\n' +
      '<div class="tab-panel" id="tab-design">' + (designMd ? '<div class="line-count">' + designMd.split('\n').length + ' 行</div>' + renderMarkdown(designMd) : '<p>design-spec.md 缺失</p>') + '</div>\n' +
      '<div class="tab-panel" id="tab-repo">' + (repoMd ? '<div class="line-count">' + repoMd.split('\n').length + ' 行</div>' + renderMarkdown(repoMd) : '<p>repo-spec.md 缺失</p>') + '</div>\n' +
      '<script>function switchTab(id,btn){document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");document.querySelectorAll(".tab-panel").forEach(function(p){p.classList.remove("active")});document.getElementById("tab-"+id).classList.add("active");window.location.hash=id}</script>\n' +
      '<script>var h=window.location.hash.replace("#","");if(h){var b=document.querySelector(".tab-btn[onclick*=\'"+h+"\']");if(b)switchTab(h,b)}</script>';

    var full = pageShell('注册表', '注册表', body, 'registry', null);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

  function pageShell(title, heading, body, active, lines) {
    var lineHtml = lines != null ? '<div class="line-count">' + lines + ' 行</div>\n' : '';
    return '<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\n<title>' + esc(title) + ' · Agentboard</title>\n<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'4\' fill=\'%23002FA7\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' font-family=\'Inter,sans-serif\' font-size=\'16\' font-weight=\'600\' fill=\'white\'%3E法%3C/text%3E%3C/svg%3E">\n\n<style>\n:root{--ink:#002FA7;--ink-rgb:0,47,167;--paper:#FAFAF8;--paper-tint:#F2F2F0;--border:#E0E0DC;--text:#0A0A0A;--text-secondary:#555;--text-muted:#999;--shadow-border:0 0 0 1px rgba(0,0,0,0.08);--shadow-card:0 1px 3px rgba(0,0,0,0.06);--shadow-card-hover:0 2px 8px rgba(0,0,0,0.1);font-family:system-ui,-apple-system,\'Microsoft YaHei\',\'PingFang SC\',sans-serif;color:var(--text);background:var(--paper);font-weight:300;font-size:16px}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh}.header{background:var(--ink);padding:14px 32px;display:flex;align-items:center;gap:24px}.header-brand{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:12px;font-weight:500;letter-spacing:.06em;color:var(--paper);text-decoration:none;white-space:nowrap;opacity:.9}.header-back{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:11px;font-weight:400;color:var(--paper);text-decoration:none;opacity:.7;margin-left:auto;transition:opacity .15s}.header-back:hover{opacity:1}.page{max-width:1080px;margin:0 auto;padding:40px 32px 80px}.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--ink);margin-bottom:24px}.page h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}.page h3{font-size:15px;font-weight:500;color:var(--text);margin:24px 0 8px}.page p,.page li{font-size:14px;line-height:1.8;color:var(--text-secondary);margin:6px 0}.page ul,.page ol{padding-left:20px;margin:8px 0}.page strong{font-weight:500;color:var(--text)}.page code{font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace;font-size:12px;background:var(--paper-tint);padding:1px 5px}.page pre{background:#f5f5f5;padding:16px;overflow-x:auto;font-size:12px;line-height:1.6;margin:12px 0}.page pre code{background:none;padding:0}.page table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}.page th,.page td{padding:8px 12px;border:1px solid var(--border);text-align:left;font-size:13px}.page th{background:var(--paper-tint);font-weight:500;font-size:12px}.page blockquote{border-left:3px solid var(--ink);margin:12px 0;padding:4px 16px;color:var(--text-secondary);font-size:13px}.page hr{border:none;border-top:1px solid var(--border);margin:24px 0}.page em{color:var(--text-secondary)}.line-count{font-size:11px;color:var(--text-muted);margin-bottom:20px;font-family:\'Cascadia Code\',\'Consolas\',\'SF Mono\',monospace}.back-link{display:inline-block;margin-top:40px;font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--border);padding:6px 16px}.back-link:hover{border-color:var(--ink)}\n</style>\n</head>\n<body>\n<div class=\"header\"><a class=\"header-brand\" href=\"/\">AGENTBOARD</a><a class=\"header-back\" href=\"/\">&#8592; 返回工具架</a></div>\n<div class=\"page\">' + lineHtml + body + '\n</div>\n</body>\n</html>';
  }

  // Home: embed initial stats for zero-loading-flash dashboard
  app.get('/', function(req, res) {
    var html = read(path.join(PROJECT_DIR, 'index.html'));
    if (!html) return res.status(500).send('index.html missing');
    var now = new Date();
    var today = now.toISOString().slice(0, 10);
    var tc = { agent: 0, browser: 0, unknown: 0 };
    var ta = { list: 0, detail: 0, control: 0, admin: 0 };
    var tdy = 0;
    for (var i = 0; i < apiLog.length; i++) {
      var e = apiLog[i];
      if ((e.ts||'').slice(0,10) === today) {
        tdy++;
        if (tc.hasOwnProperty(e.caller)) tc[e.caller]++; else tc[e.caller] = 1;
        ta[e.action] = (ta[e.action]||0) + 1;
      }
    }
    var assetToolCount = listDirs(TOOLS_DIR).length;
    var assetSkillCount = fs.existsSync(SKILLS_DIR) ? listDirs(SKILLS_DIR).length : 0;
    var assetCommandCount = BUILTIN_COMMANDS.length;
    var assetTipCount = fs.existsSync(TIPS_DIR) ? fs.readdirSync(TIPS_DIR).filter(function(f){ return f.endsWith('.md'); }).length : 0;
    var apiEndpoints = 0;
    try { app._router.stack.forEach(function(r){ if (r.route && r.route.path && r.route.path.indexOf('/api/') === 0) apiEndpoints++; }); } catch(_) {}
    var cronTasks = (function(){
      try { var schedSt = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.scheduler', 'scheduler-state.json'), 'utf8')); return Object.keys(schedSt.tasks || {}).length; } catch(_) { return 0; }
    })();
    var snap = JSON.stringify({
      todayCalls: tdy,
      byCaller: { agent: tc.agent||0, browser: tc.browser||0, unknown: tc.unknown||0 },
      byAction: { list: ta.list||0, control: (ta.control||0)+(ta.detail||0), admin: ta.admin||0 },
      assets: { tools: assetToolCount, skills: assetSkillCount, commands: assetCommandCount, tips: assetTipCount, api: apiEndpoints, cron: cronTasks, registry: 1 }
    });
    html = html.replace('<!--STATS_SNAPSHOT-->', '<script>window.__stats=' + snap + '</script>');
    res.type('html').send(html);
  });

  app.use(express.static(PROJECT_DIR));

  process.on('uncaughtException', function(err) {
    opslog.error('uncaughtException', (err && err.message) || String(err), { stack: err && err.stack });
    console.error('[agentboard] uncaughtException:', err && err.stack || err);
    // EADDRINUSE is fatal — exit so PM2 can restart cleanly instead of going zombie
    if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
      process.exit(1);
    }
  });
  process.on('unhandledRejection', function(reason) {
    var msg = (reason && reason.message) || String(reason);
    opslog.error('unhandledRejection', msg, { stack: reason && reason.stack });
    console.error('[agentboard] unhandledRejection:', reason && reason.stack || reason);
  });

  // Health endpoint for patrol agents
  app.get('/health', function(req, res) {
    var h = getHealth();
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(h);
  });

  // Loop联邦巡检 — aggregate health from inspector projects + scheduler + agentboard
  app.get('/api/loop/health', function(req, res) {
    var projectsDir = path.join(os.homedir(), '.inspector', '_runtime', 'projects');
    var schedulerStatePath = path.join(os.homedir(), '.scheduler', 'scheduler-state.json');
    var projects = [];

    // Inspector project results
    try {
      var files = fs.readdirSync(projectsDir).filter(function(f) { return f.endsWith('.json'); });
      files.forEach(function(f) {
        try {
          var d = JSON.parse(fs.readFileSync(path.join(projectsDir, f), 'utf8'));
          projects.push({ id: d.project || f.replace('.json', ''), bone: d.bone || false, ok: d.ok,
            score: d.score || '', ts: d.ts, checks: (d.checks || []).map(function(c) {
              return { id: c.id, label: c.label, pass: c.pass };
            }) });
        } catch(_) {}
      });
    } catch(_) {}

    // Agentboard self-health (live — overwrite inspector's stale snapshot if exists)
    var abHealth = getHealth();
    var abIdx = -1;
    for (var pi = 0; pi < projects.length; pi++) {
      if (projects[pi].id === 'agentboard') { abIdx = pi; break; }
    }
    var abEntry = { id: 'agentboard', bone: true, ok: abHealth.status === 'ok',
      uptime: abHealth.uptime, crashes24h: abHealth.crashes24h };
    if (abIdx >= 0) projects[abIdx] = abEntry;
    else projects.push(abEntry);

    // Scheduler job health summary
    try {
      var ss = JSON.parse(fs.readFileSync(schedulerStatePath, 'utf8'));
      var tasks = ss.tasks || {};
      var jobSummary = { id: 'scheduler-jobs', bone: true, jobs: {} };
      var ok = true;
      Object.keys(tasks).forEach(function(jid) {
        var t = tasks[jid];
        var status = t.lastStatus || 'pending';
        if (status === 'error' || status === 'fatal_error') ok = false;
        jobSummary.jobs[jid] = { status: status, lastRun: t.lastRun || null, consecutiveErrors: t.consecutiveErrors || 0 };
      });
      jobSummary.ok = ok;
      projects.push(jobSummary);
    } catch(_) {}

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ projects: projects, updated: new Date().toISOString() });
  });

  var PORT = process.env.PORT || 3099;
  app.listen(PORT, function() {
    opslog.info('server-start', 'server started', { port: PORT, pid: process.pid });
    console.log('Agentboard http://localhost:' + PORT);
  });

  // ── self-check: die fast so supervisor can resurrect ──────────────────────
  var SELF_CHECK_INTERVAL = 5000;
  var LAG_THRESHOLD_MS = 3000;
  var MEM_THRESHOLD_GB = 2;
  var lagFails = 0;

  function checkSelf() {
    // skip self-check when debugging — breakpoints look like event loop lag
    if (process.execArgv.some(function(a) { return a.indexOf('--inspect') === 0; })) return;
    // event loop lag — schedule immediate callback, measure real delay
    var t0 = Date.now();
    setImmediate(function() {
      var lag = Date.now() - t0;
      if (lag > LAG_THRESHOLD_MS) {
        lagFails++;
        if (lagFails >= 2) {
          opslog.error('self-check-suicide', 'event loop lag ' + lag + 'ms x' + lagFails + ', exiting(7)', { lag_ms: lag, consecutive: lagFails });
          process.exit(7);
        }
        opslog.info('self-check-lag', 'event loop lag ' + lag + 'ms', { lag_ms: lag });
      } else {
        lagFails = 0;
      }

      // memory
      var heapGB = process.memoryUsage().heapUsed / (1024 * 1024 * 1024);
      if (heapGB > MEM_THRESHOLD_GB) {
        opslog.error('self-check-suicide', 'heap ' + heapGB.toFixed(1) + 'GB > ' + MEM_THRESHOLD_GB + 'GB, exiting(7)', { heap_gb: heapGB });
        process.exit(7);
      }
    });
  }

  setInterval(checkSelf, SELF_CHECK_INTERVAL);
}

if (require.main === module) {
  startServer();
}
