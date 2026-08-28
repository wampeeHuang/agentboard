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
const commandsApi = require('./lib/commands')(AGENTBOARD_HOME);
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
function listDirs(p) { try { return fs.readdirSync(p).filter(function(name){ if (name.charAt(0) === '.') return false; try { return fs.statSync(path.join(p, name)).isDirectory(); } catch(_) { return false; } }); } catch(_) { return []; } }
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

function parseSkill(name, baseDir, disabled) {
  var skillMd = read(path.join(baseDir, name, 'SKILL.md'));
  if (!skillMd) return null;
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
    var bodyLines = body.split('\n');
    for (var i = 0; i < bodyLines.length; i++) {
      var line = bodyLines[i].trim();
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
  return {
    name: name,
    displayName: (fm.display_name && String(fm.display_name).trim()) ? String(fm.display_name).trim() : getChineseName(name),
    description: desc,
    trigger: fm.trigger || '',
    icon: (fm.icon && String(fm.icon).trim()) ? String(fm.icon).trim() : '',
    mono: mono,
    category: (fm.category && String(fm.category).trim()) ? String(fm.category).trim() : classifySkill(name, desc),
    folderPath: path.join(baseDir, name),
    disabled: !!disabled
  };
}

function scanAllSkills() {
  var skills = [];
  var seen = {};
  listDirs(SKILLS_DIR).forEach(function(name) {
    if (seen[name]) return;
    seen[name] = true;
    var s = parseSkill(name, SKILLS_DIR, false);
    if (s) skills.push(s);
  });
  var disDir = path.join(SKILLS_DIR, '_disabled');
  if (fs.existsSync(disDir)) {
    listDirs(disDir).forEach(function(name) {
      if (seen[name]) return;
      seen[name] = true;
      var s = parseSkill(name, disDir, true);
      if (s) skills.push(s);
    });
  }
  return skills;
}

// 停用技能：把 skills/<name> 移到 skills/_disabled/<name>（Claude Code 不再发现）；启用反向。
function moveSkillDir(name, disable) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, status: 400, error: '非法技能名' };
  var src = disable ? safeResolve(SKILLS_DIR, name) : safeResolve(SKILLS_DIR, '_disabled', name);
  var dst = disable ? safeResolve(SKILLS_DIR, '_disabled', name) : safeResolve(SKILLS_DIR, name);
  if (!src || !dst) return { ok: false, status: 400, error: '路径越界' };
  if (!fs.existsSync(src)) return { ok: false, status: 404, error: '技能不存在' };
  if (!fs.statSync(src).isDirectory() || !fs.existsSync(path.join(src, 'SKILL.md'))) {
    return { ok: false, status: 400, error: '非技能目录，拒绝移动' };
  }
  if (fs.existsSync(dst)) return { ok: false, status: 409, error: '目标已存在' };
  try { if (disable) { var disDir = path.join(SKILLS_DIR, '_disabled'); if (!fs.existsSync(disDir)) fs.mkdirSync(disDir); } fs.renameSync(src, dst); } catch (e) { return { ok: false, status: 500, error: '移动失败: ' + e.message }; }
  return { ok: true, disabled: disable, name: name };
}

// 回收技能：把 skills/<name> 移到 skills/_trash/<name>（回收区，可手动搬回恢复）。
function trashSkill(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, status: 400, error: '非法技能名' };
  var src = safeResolve(SKILLS_DIR, name);
  var dst = safeResolve(SKILLS_DIR, '_trash', name);
  if (!src || !dst) return { ok: false, status: 400, error: '路径越界' };
  if (!fs.existsSync(src)) return { ok: false, status: 404, error: '技能不存在' };
  if (!fs.statSync(src).isDirectory() || !fs.existsSync(path.join(src, 'SKILL.md'))) {
    return { ok: false, status: 400, error: '非技能目录，拒绝移动' };
  }
  if (fs.existsSync(dst)) return { ok: false, status: 409, error: '回收站已有同名' };
  try { var trDir = path.join(SKILLS_DIR, '_trash'); if (!fs.existsSync(trDir)) fs.mkdirSync(trDir); fs.renameSync(src, dst); } catch (e) { return { ok: false, status: 500, error: '移动失败: ' + e.message }; }
  return { ok: true, trashed: true, name: name };
}

function classifySkill(name, desc) {
  // 单一维度：技能产出什么
  var MAP = {
    'algorithmic-art': '视觉与设计',
    'archify': '视觉与设计',
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
    'smart-search': '开发与工具',
    'workspace-governor': '思维与方法'
  };
  if (MAP[name]) return MAP[name];
  if (name.indexOf('lark-') === 0) return '开发与工具';
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
  var ctx = { read: read, esc: esc, monogram: monogram, listDirs: listDirs, openFolder: openFolder, safeResolve: safeResolve, getChineseName: getChineseName, scanAllSkills: scanAllSkills, parseSkill: parseSkill, moveSkillDir: moveSkillDir, trashSkill: trashSkill, renderMarkdown: renderMarkdown, scanTools: scanTools, findManifest: findManifest, startTool: startTool, stopTool: stopTool, createTool: createTool, updateTool: updateTool, getHealth: getHealth, apiHTML: apiHTML, registry: registry, TOOLS_DIR: TOOLS_DIR, SKILLS_DIR: SKILLS_DIR, TIPS_DIR: TIPS_DIR, PRINCIPLES_DIR: PRINCIPLES_DIR, LOCAL_SKILLS_DIR: LOCAL_SKILLS_DIR, PROJECT_DIR: PROJECT_DIR, AGENTBOARD_HOME: AGENTBOARD_HOME, apiLog: apiLog, apiCounts: apiCounts, BUILTIN_COMMANDS: commandsApi.SEED_COMMANDS, commands: commandsApi };

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