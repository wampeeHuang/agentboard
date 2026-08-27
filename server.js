const express = require('express');
const fs = require('fs');
const path = require('path');
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
var apiHTML = require('./lib/api-page');
const TIPS_DIR = process.env.AGENTBOARD_TIPS_DIR || path.join(AGENTBOARD_HOME, 'tips');
const PRINCIPLES_DIR = process.env.AGENTBOARD_PRINCIPLES_DIR || path.join(AGENTBOARD_HOME, 'principles');
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
  if (/\b(design|art|theme|visual|brand|canvas|illustrat|gif|animation|whiteboard|feishu)\b/i.test(s)) return '视觉与设计';
  if (/\b(writ|doc|article|internal.comm|report|blog|memo|faq)\b/i.test(s)) return '写作与文档';
  if (/\b(pdf|docx|xlsx|pptx?|excel|word|powerpoint|format|convert|markdown|csv|spreadsheet)\b/i.test(s)) return '文件与格式';
  if (/\b(api|mcp|sdk|server|code|test|debug|build|deploy|playwright|browser|automation|cli|git|npm|node|react|tailwind|component)\b/i.test(s)) return '开发与工具';
  if (/\b(perspective|mindset|framework|think|mentor|philosophy|methodology|distill)\b/i.test(s)) return '思维与方法';
  return '其他';
}

function renderMarkdown(md, opts) {
  opts = opts || {};
  var keepH1 = opts.keepH1 !== false;
  var body = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!keepH1) body = body.replace(/^#\s+.*\n/, '');
  var codeBlocks = [];
  body = body.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    codeBlocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
    return '\u0000CODE' + (codeBlocks.length - 1) + '\u0000';
  });
  body = body.replace(/`([^`]+)`/g, '<code>$1</code>');
  body = body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  body = body.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  body = body.replace(/^### (.+)/gm, '<h3>$1</h3>');
  body = body.replace(/^## (.+)/gm, '<h2>$1</h2>');
  if (keepH1) body = body.replace(/^# (.+)/gm, '<h1>$1</h1>');
  body = body.replace(/^- (.+)/gm, '<li>$1</li>');
  body = body.replace(/(<li>.*<\/li>\n?)+/g, function(m) { return '<ul>' + m.replace(/\s+$/, '') + '</ul>'; });
  body = body.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
  body = body.replace(/<p>\s*<\/p>/g, '');
  body = body.replace(/<p>\u0000CODE(\d+)\u0000<\/p>/g, function(_, i) { return codeBlocks[+i]; });
  body = body.replace(/\u0000CODE(\d+)\u0000/g, function(_, i) { return codeBlocks[+i]; });
  return body;
}

function scanTools() { return registry.scanTools(TOOLS_DIRS); }
function findManifest(id) { return registry.findManifest(id, TOOLS_DIRS); }
function startTool(id) { return registry.startTool(id, TOOLS_DIRS); }
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
'.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--green);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:13px;font-weight:500}\n' +
'.card-info{flex:1;min-width:0}\n' +
'.card-name{font-size:16px;font-weight:300;letter-spacing:-0.01em;line-height:1.35}\n' +
'.card-sub{font-size:12px;color:var(--text-muted);font-weight:300;line-height:1.35;margin-top:2px}\n' +
'.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\n' +
'.card-desc b{font-weight:500;color:var(--text)}\n' +
'.skill-card:hover .card-desc{-webkit-line-clamp:unset;overflow:visible}\n' +
'.skill-trigger{font-size:11px;color:var(--text-muted);margin-top:4px}\n' +
'.skill-trigger span{font-size:9px;font-weight:500;color:var(--green);border:1px solid var(--green);padding:0 4px;margin-right:4px}\n' +
'.skill-folder{font-size:11px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 6px;background:var(--paper-tint);transition:background .12s}\n' +
'.skill-folder:hover{background:rgba(var(--green-rgb),0.08)}\n' +
'.skill-folder .folder-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}\n' +
'.skill-folder .folder-open{background:none;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:12px;padding:1px 4px;line-height:1;flex-shrink:0}\n' +
'.skill-folder .folder-open:hover{background:var(--green);color:var(--paper)}\n' +
'.folder-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green);color:var(--paper);padding:8px 20px;font-family:"Cascadia Code","Consolas","SF Mono",monospace;font-size:12px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}\n' +
'.folder-toast.show{opacity:1}\n' +
'.cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}\n' +
'.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"Cascadia Code","Consolas","SF Mono",monospace;letter-spacing:.03em;background:var(--paper-tint, #F2F2F0);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
'.cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
'.cat-pill.active{background:var(--green);border-color:var(--green);color:var(--paper)}\n' +
'.cat-pill .count{font-size:10px;opacity:.7}\n' +
'.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
'.back-link:hover{border-color:var(--green);color:var(--green)}\n' +
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
    '.cat-pill.active{background:var(--green);border-color:var(--green);color:var(--paper)}\n' +
    '.cat-pill .count{font-size:10px;opacity:.7}\n' +
    '.cmd-section h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}\n' +
    '.cmd-table-wrap{overflow-x:auto}\n' +
    '.cmd-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}\n' +
    '.cmd-table th{background:var(--paper-tint);font-weight:500;font-size:12px;padding:8px 12px;border:1px solid var(--border);text-align:left;white-space:nowrap}\n' +
    '.cmd-table td{padding:8px 12px;border:1px solid var(--border);font-size:13px;line-height:1.5}\n' +
    '.cmd-code{font-family:"Cascadia Code","Consolas","SF Mono","SF Mono","Consolas",monospace;font-size:12px;background:var(--paper-tint);padding:2px 6px;color:var(--green);white-space:nowrap}\n' +
    '.cmd-desc{color:var(--text-secondary);font-size:12px}\n' +
    '.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
    '.back-link:hover{border-color:var(--green);color:var(--green)}\n' +
    '.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--green);margin-bottom:8px}\n' +
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



  // shared context for route/static modules (module-level helpers + closure logging state)
  var ctx = { read: read, esc: esc, monogram: monogram, listDirs: listDirs, openFolder: openFolder, safeResolve: safeResolve, getChineseName: getChineseName, scanAllSkills: scanAllSkills, renderMarkdown: renderMarkdown, scanTools: scanTools, findManifest: findManifest, startTool: startTool, stopTool: stopTool, createTool: createTool, updateTool: updateTool, skillIndexHTML: skillIndexHTML, commandsIndexHTML: commandsIndexHTML, getHealth: getHealth, apiHTML: apiHTML, registry: registry, TOOLS_DIR: TOOLS_DIR, SKILLS_DIR: SKILLS_DIR, TIPS_DIR: TIPS_DIR, PRINCIPLES_DIR: PRINCIPLES_DIR, LOCAL_SKILLS_DIR: LOCAL_SKILLS_DIR, PROJECT_DIR: PROJECT_DIR, apiLog: apiLog, apiCounts: apiCounts, BUILTIN_COMMANDS: BUILTIN_COMMANDS };

  // routes (REST API + content)
  require('./lib/routes')(app, ctx);

  // home + static (web/)
  require('./lib/static')(app, ctx);

  // MCP Streamable HTTP
  require('./lib/mcp-http')(app);
  process.on('uncaughtException', function(err) {
    opslog.error('uncaughtException', (err && err.message) || String(err), { stack: err && err.stack });
    console.error('[agentboard] uncaughtException:', err && err.stack || err);
    // EADDRINUSE 致命——退出，让守护者（Supervisor）重启，避免僵尸进程占端口
    if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
      process.exit(1);
    }
  });
  process.on('unhandledRejection', function(reason) {
    var msg = (reason && reason.message) || String(reason);
    opslog.error('unhandledRejection', msg, { stack: reason && reason.stack });
    console.error('[agentboard] unhandledRejection:', reason && reason.stack || reason);
  });

  var PORT = process.env.PORT || 3099;
  // 绑定回环：不绑 0.0.0.0，局域网不可达（Local-first）
  app.listen(PORT, '127.0.0.1', function() {
    opslog.info('server-start', 'server started', { port: PORT, host: '127.0.0.1', pid: process.pid });
    console.log('Agentboard http://localhost:' + PORT);
  });

  // self-check: die fast so supervisor can resurrect
  require('./lib/self-check').start();
}

if (require.main === module) {
  startServer();
}