const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');

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

var _persCache = null;
function loadPerspectives() {
  if (_persCache) return _persCache;
  var result = [];
  if (!fs.existsSync(SKILLS_DIR)) { _persCache = result; return result; }
  listDirs(SKILLS_DIR).forEach(function(name) {
    if (!name.startsWith('perspective-')) return;
    var skillMd = read(path.join(SKILLS_DIR, name, 'SKILL.md'));
    if (!skillMd) return;
    var fm = {};
    var fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    var body = '';
    if (fmMatch) {
      fmMatch[1].split('\n').forEach(function(line) {
        var m = line.match(/^(\w+):\s*(.+)/);
        if (m) fm[m[1]] = m[2].trim();
      });
      body = skillMd.substring(fmMatch[0].length).trim();
    } else { body = skillMd.trim(); }
    body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Extract name_cn and name_en from trigger field
    var triggerParts = (fm.trigger || '').split(',').map(function(s) { return s.trim(); });
    var name_cn = triggerParts[0] || '';
    var name_en = triggerParts[1] || '';
    // Oneliner: from description or fallback to body
    var desc = fm.description || '';
    if (desc.startsWith('|')) desc = desc.substring(1).trim();
    desc = desc.replace(/\n\s+/g, ' ');
    var oneliner = desc.split(/[。.，,\n]/)[0].trim();
    if (!oneliner || oneliner.length < 5) {
      // Fallback: first meaningful line from body
      var bodyLines = body.split('\n');
      for (var bi = 0; bi < bodyLines.length; bi++) {
        var bl = bodyLines[bi].trim();
        if (bl && !bl.startsWith('#') && !bl.startsWith('>') && bl.length > 10) {
          oneliner = bl.replace(/\r/g, '').substring(0, 100);
          break;
        }
      }
    }
    if (oneliner.length > 100) oneliner = oneliner.substring(0, 100) + '...';
    // Extract model names from markdown body (look for ### under 核心心智模型 section)
    var modelNames = [];
    var modelSection = body.match(/##\s*(?:核心心智模型|Core Mental Models|心智模型)[\s\S]*?(?=## |$)/);
    var searchBody = modelSection ? modelSection[0] : '';
    var modelRe = /^###\s+(.+)$/gm;
    var mm;
    while ((mm = modelRe.exec(searchBody)) !== null) {
      var mn = mm[1].trim();
      if (mn && !/^(?:使用说明|角色扮演|触发|规则|注意|排除|Step |激活|示例|自动|误激活|Gate )/.test(mn)) {
        modelNames.push(mn);
      }
    }
    // Category
    var category = classifyPerspective(name, body, desc);
    result.push({
      id: name,
      name_cn: name_cn,
      name_en: name_en,
      oneliner: oneliner,
      category: category,
      modelPills: modelNames.slice(0, 4),
      body: body,
      description: desc,
      trigger: fm.trigger || ''
    });
  });
  _persCache = result;
  return result;
}

function classifyPerspective(name, body, desc) {
  // Only use name + description — body contains methodology instructions, not identity signals
  var firstPara = '';
  if (body) {
    var bp = body.split(/##\s/)[0]; // only first section before any ## heading
    if (bp) firstPara = bp.substring(0, 300); // at most 300 chars
  }
  var s = (name + ' ' + (desc || '') + ' ' + firstPara).toLowerCase();
  // Order: strong profession signals first, generic terms (设计) last
  var sciRe = /physics|quantum|science|物理|量子|宇宙|天体|相对论|科学|霍金/;
  var aiRe = /ai\b|llm|gpt|machine.learn|deep.learn|transformer|neural|人工智能|深度学习|机器学习|神经网络|cuda|自动驾驶/;
  var bizRe = /founder|startup|venture|invest|创始|创业|投资|商业|增长|商业模式|创始人|企业家|产品方法论|硅谷/;
  var mktRe = /marketing|advertising|copywriting|brand|营销|广告|品牌|文案|消费者|销售信|科学广告/;
  var litRe = /novel|fiction|sci\.fi|小说|科幻|文学|散文|出版|三体|写作/;
  var filmRe = /film|movie|director|cinema|电影|导演|影视|镜头|摄影|映画|动画|编剧|制片|cinematograph/;
  var socialRe = /politic|trump|政治|社会|总统|懂王|选举|美国|政/;
  var eduRe = /teach|learn|education|mentor|教育|导师|老师|高考|考研|网课|培训/;
  var philoRe = /philosoph|哲学|思想|认知|随机|反脆弱|黑天鹅|不确定性/;
  var designRe = /architect|建筑设计|室内设计|工业设计|平面设计|交互设计|用户体验|建筑师|室内装修|住宅设计|家居设计|产品设计|工业设计|设计方法论/;
  if (sciRe.test(s)) return '科学/技术';
  if (aiRe.test(s)) return '人工智能';
  if (bizRe.test(s)) return '商业/经济';
  if (mktRe.test(s)) return '营销/传播';
  if (litRe.test(s)) return '文学/人文';
  if (filmRe.test(s)) return '影视/创作';
  if (socialRe.test(s)) return '社会/政治';
  if (eduRe.test(s)) return '教育/学习';
  if (philoRe.test(s)) return '哲学/思想';
  if (designRe.test(s)) return '设计/艺术';
  return '其他';
}

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
  TOOLS_DIRS.concat([LOCAL_TOOLS_DIR]).forEach(function(dir) {
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
      tools.push({ name: mf.name, id: name, description: mf.description || '', icon: mf.icon || '', version: mf.version || '', category: mf.category, order: mf.order, port: mf.port, ports: mf.ports, url: mf.url, running: running, startCommand: mf.startCommand, stopCommand: mf.stopCommand, projectPath: mf.projectPath, publicUrl: mf.publicUrl, owner: mf.owner || '', apiBase: mf.apiBase, type: mf.type || 'service', trigger: mf.trigger || '', children: mf.children || [], conflicts: [] });
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

function findManifest(id) {
  for (var i = 0; i < TOOLS_DIRS.length; i++) {
    var p = safeResolve(TOOLS_DIRS[i], id, 'manifest.json');
    if (p && fs.existsSync(p)) return p;
  }
  return safeResolve(TOOLS_DIR, id, 'manifest.json'); // fallback for new tools
}

function startTool(id) {
  const mfPath = findManifest(id);
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
  const mfPath = findManifest(id);
  if (!mfPath) return callback(null, { ok: false, error: 'forbidden' });
  let mf;
  try { mf = JSON.parse(read(mfPath)); } catch(_) { return callback(null, { ok: false, error: 'manifest not found' }); }
  if (!mf.stopCommand) return callback(null, { ok: false, error: 'no stopCommand' });
  exec(mf.stopCommand, { timeout: 10000, encoding: 'utf8' }, function(err) {
    if (err) return callback(null, { ok: false, error: err.message });
    callback(null, { ok: true });
  });
}

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
'.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:500}\n' +
'.card-info{flex:1;min-width:0}\n' +
'.card-name{font-size:16px;font-weight:300;letter-spacing:-0.01em;line-height:1.35}\n' +
'.card-sub{font-size:12px;color:var(--text-muted);font-weight:300;line-height:1.35;margin-top:2px}\n' +
'.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\n' +
'.card-desc b{font-weight:500;color:var(--text)}\n' +
'.skill-card:hover .card-desc{-webkit-line-clamp:unset;overflow:visible}\n' +
'.skill-trigger{font-size:11px;color:var(--text-muted);margin-top:4px}\n' +
'.skill-trigger span{font-size:9px;font-weight:500;color:var(--ink);border:1px solid var(--ink);padding:0 4px;margin-right:4px}\n' +
'.skill-folder{font-size:11px;font-family:"JetBrains Mono",monospace;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:4px;cursor:pointer;padding:2px 6px;background:var(--paper-tint);transition:background .12s}\n' +
'.skill-folder:hover{background:rgba(0,47,167,0.06)}\n' +
'.skill-folder .folder-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}\n' +
'.skill-folder .folder-open{background:none;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;font-size:12px;padding:1px 4px;line-height:1;flex-shrink:0}\n' +
'.skill-folder .folder-open:hover{background:var(--ink);color:var(--paper)}\n' +
'.folder-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:8px 20px;font-family:"JetBrains Mono",monospace;font-size:12px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none}\n' +
'.folder-toast.show{opacity:1}\n' +
'.cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}\n' +
'.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"JetBrains Mono",monospace;letter-spacing:.03em;background:var(--paper-tint, #F2F2F0);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
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
    '.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"JetBrains Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
    '.cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
    '.cat-pill.active{background:var(--ink);border-color:var(--ink);color:var(--paper)}\n' +
    '.cat-pill .count{font-size:10px;opacity:.7}\n' +
    '.cmd-section h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}\n' +
    '.cmd-table-wrap{overflow-x:auto}\n' +
    '.cmd-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}\n' +
    '.cmd-table th{background:var(--paper-tint);font-weight:500;font-size:12px;padding:8px 12px;border:1px solid var(--border);text-align:left;white-space:nowrap}\n' +
    '.cmd-table td{padding:8px 12px;border:1px solid var(--border);font-size:13px;line-height:1.5}\n' +
    '.cmd-code{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:12px;background:var(--paper-tint);padding:2px 6px;color:var(--ink);white-space:nowrap}\n' +
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

  app.get('/api', function(req, res) {
    var data = {
      name: 'Agentboard',
      version: '1.0.0',
      description: 'Filesystem-as-registry toolchain control plane for AI agents',
      endpoints: {
        'GET /api': 'This discovery document',
        'GET /api/tools': 'List all registered tools with running status',
        'POST /api/tools/start/:id': 'Start a tool by id',
        'POST /api/tools/stop/:id': 'Stop a tool by id',
        'POST /api/tools/reorder': 'Reorder tools (body: {items: [{id, order}]})'
      },
      manifestSchema: {
        id: 'string — directory name under TOOLS_DIR',
        name: 'string — display name',
        description: 'string',
        icon: 'string — emoji or single character',
        version: 'string',
        category: 'string',
        order: 'number — sort order',
        port: 'number — single port',
        ports: 'number[] — multiple ports',
        projectPath: 'string — working directory',
        url: 'string — browser URL when running',
        startCommand: 'string — shell command to start',
        stopCommand: 'string — shell command to stop'
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

  // --- Tools API ---
  app.get('/api/tools', function(req, res) {
    var tools = scanTools();
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
    stopTool(req.params.id, function(err, result) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json(result);
    });
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

  // Skills (Claude Code 技能目录 — 只读索引)
  app.get('/skills', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var skills = scanAllSkills();
    var body = skillIndexHTML(skills);
    res.send(pageShell('技能', 'Claude Code 技能目录', body, 'skills', skills.length));
  });

  // Commands (Claude Code 内置命令参考)
  app.get('/commands', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var body = commandsIndexHTML();
    res.send(pageShell('命令', 'Claude Code 内置命令参考', body, 'commands', BUILTIN_COMMANDS.length));
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
      if (name.startsWith('_')) return;
      if (name === 'node_modules' || name === '.git') return;

      var meta = {};
      try { meta = JSON.parse(read(path.join(fullPath, '.project.json'))); } catch(_) {}

      var latest = stat.mtime;
      try {
        walkDir(fullPath, function(subPath) {
          try {
            var s = fs.statSync(subPath);
            if (s.mtime > latest) latest = s.mtime;
          } catch(_) {}
        });
      } catch(_) {}

      var daysAgo = Math.floor((Date.now() - latest.getTime()) / 86400000);
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
    var recencyOrder = {week:0, halfMonth:1, month:2, older:3};
    projects.sort(function(a,b) {
      var sa = statusOrder[a.status] != null ? statusOrder[a.status] : 99;
      var sb = statusOrder[b.status] != null ? statusOrder[b.status] : 99;
      if (sa !== sb) return sa - sb;
      return (recencyOrder[a.recency] || 99) - (recencyOrder[b.recency] || 99);
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

    var statusBar = '<div class="cat-bar">' +
      '<button class="cat-pill active" data-filter="all" onclick="setFilter(\'all\')">全部<span class="count">' + projects.length + '</span></button>' +
      '<button class="cat-pill" data-filter="active" onclick="setFilter(\'active\')">🟢 活跃<span class="count">' + (catCounts.active || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="archived" onclick="setFilter(\'archived\')">🟡 已归档<span class="count">' + (catCounts.archived || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="abandoned" onclick="setFilter(\'abandoned\')">⚫ 已放弃<span class="count">' + (catCounts.abandoned || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="undefined" onclick="setFilter(\'undefined\')">⚪ 待定义<span class="count">' + (catCounts.undefined || 0) + '</span></button>' +
      '</div>';

    var recencyBar = '<div class="cat-bar" style="margin-top:-8px">' +
      '<span style="font-size:10px;color:var(--text-muted);margin-right:4px;font-family:\'JetBrains Mono\',monospace\">时间</span>' +
      '<button class="cat-pill" data-filter="week" onclick="setRecencyFilter(\'week\')">⏱ 7天内<span class="count">' + (catCounts.week || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="halfMonth" onclick="setRecencyFilter(\'halfMonth\')">📅 15天内<span class="count">' + (catCounts.halfMonth || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="month" onclick="setRecencyFilter(\'month\')">🗓 30天内<span class="count">' + (catCounts.month || 0) + '</span></button>' +
      '<button class="cat-pill" data-filter="older" onclick="setRecencyFilter(\'older\')">🏛 超过30天<span class="count">' + (catCounts.older || 0) + '</span></button>' +
      '</div>';

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
      '.cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}\n' +
      '.cat-pill{padding:5px 12px;font-size:12px;font-weight:400;font-family:"JetBrains Mono",monospace;letter-spacing:.03em;background:var(--paper-tint);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:5px}\n' +
      '.cat-pill:hover{background:#E4E4DE;color:var(--text)}\n' +
      '.cat-pill.active{background:var(--ink);border-color:var(--ink);color:var(--paper)}\n' +
      '.cat-pill .count{font-size:10px;opacity:.7}\n' +
      '.proj-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:12px;margin-top:8px}\n' +
      '.proj-card{background:var(--paper);padding:20px;display:flex;flex-direction:column;gap:6px;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-border),var(--shadow-card)}\n' +
      '.proj-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.card-body{display:flex;align-items:flex-start;gap:12px;flex:1}\n' +
      '.card-mono{flex-shrink:0;width:40px;height:40px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:500}\n' +
      '.card-info{flex:1;min-width:0}\n' +
      '.card-name{font-size:15px;font-weight:400;letter-spacing:-0.01em;line-height:1.4;display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n' +
      '.card-dir{font-size:10px;font-family:"JetBrains Mono",monospace;color:var(--text-muted);margin-top:1px}\n' +
      '.card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.45;margin-top:6px}\n' +
      '.card-meta{margin-top:4px}\n' +
      '.card-actions{margin-top:4px}\n' +
      '.status-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%}\n' +
      '.status-dot.on{background:var(--status-on);animation:pulse 2s ease-in-out infinite}\n' +
      '.status-dot.warn{background:#D97706}\n' +
      '.status-dot.off{background:var(--status-off)}\n' +
      '.status-dot.none{background:var(--border)}\n' +
      '.status-tag{font-size:10px;padding:1px 6px;font-weight:400;font-family:"JetBrains Mono",monospace}\n' +
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
      '.page .ws-subtitle{font-size:13px;color:var(--text-muted);font-weight:300;margin-bottom:20px;font-family:"JetBrains Mono",monospace}\n' +
    '</style>\n' +
    '<a class="back-link" href="/">← 返回工具架</a>\n' +
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
    '  document.querySelectorAll(".cat-bar:first-of-type .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}\n' +
    'function setRecencyFilter(t) {\n' +
    '  currentRecency = t;\n' +
    '  document.querySelectorAll(".cat-bar:nth-of-type(2) .cat-pill").forEach(function(p){p.classList.toggle("active", p.dataset.filter === t);});\n' +
    '  applyFilters();\n' +
    '}' +
    '<\/script>';

    // Also serve /open-dir for workspace subdirs via existing /open-dir route
  }

  // Workspace sub-page
  app.get('/workspace/:id', function(req, res) {
    try {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      var mfPath = findManifest(req.params.id);
      if (!mfPath) return res.status(404).send('找不到工作区');
      var mf = JSON.parse(read(mfPath));
      if (!mf.projectPath) return res.status(400).send('该工具不是工作区');
      var projects = scanWorkspace(mf.projectPath);
      var body = workspaceHTML(projects, mf);
      res.send(pageShell(mf.name, mf.projectPath, body, 'workspace', projects.length));
    } catch(e) {
      console.error('Workspace error:', e.message, e.stack);
      res.status(500).send('Error: ' + e.message);
    }
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

  // Diagrams index — only skills with system-diagram.html
  app.get('/diagrams', function(req, res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    var diagrams = [];
    var seen = {};
    var dirs = [LOCAL_SKILLS_DIR, SKILLS_DIR];
    dirs.forEach(function(dir) {
      if (!fs.existsSync(dir)) return;
      listDirs(dir).forEach(function(name) {
        if (seen[name]) return;
        seen[name] = true;
        var diagramPath = path.join(dir, name, 'references', 'system-diagram.html');
        if (!fs.existsSync(diagramPath)) return;
        var skillMd = read(path.join(dir, name, 'SKILL.md'));
        var displayName = name;
        var desc = '';
        if (skillMd) {
          var fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (fmMatch) {
            var descMatch = fmMatch[1].match(/description:\s*(.+)/);
            if (descMatch) desc = descMatch[1].trim();
          }
          if (!desc) {
            var body2 = skillMd.replace(/^---[\s\S]*?---\n*/, '').replace(/^#\s+.*\n*/, '');
            var firstLine = body2.split('\n').find(function(l) { return l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('>') && l.trim().length > 10; });
            if (firstLine) desc = firstLine.trim().substring(0, 120);
          }
        }
        var cnName = getChineseName(name);
        diagrams.push({ name: name, displayName: cnName, description: desc });
      });
    });
    diagrams.sort(function(a, b) { return a.displayName.localeCompare(b.displayName, 'zh-CN'); });
    var cards = diagrams.map(function(d) {
      var words = d.name.split(/[-_]/).filter(function(w) { return w.length > 0; });
      var mono = words.length >= 2 ? (words[0][0] + words[words.length-1][0]).toUpperCase() : d.name.substring(0,2).toUpperCase();
      return '<a href="/skills/' + esc(d.name) + '" class="diagram-card" target="_blank">' +
        '<div class="card-mono">' + esc(mono) + '</div>' +
        '<div class="card-info">' +
          '<div class="card-name">' + esc(d.displayName) + '</div>' +
          '<div class="card-sub">' + esc(d.name) + '</div>' +
          (d.description ? '<div class="card-desc">' + esc(d.description) + '</div>' : '') +
          '<div class="card-link">打开结构图 →</div>' +
        '</div>' +
      '</a>';
    }).join('\n');

    var body = '<style>\n' +
      '.diagram-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px;margin-top:8px}\n' +
      '.diagram-card{background:var(--paper);padding:20px;display:flex;align-items:flex-start;gap:14px;transition:transform .15s,box-shadow .15s;box-shadow:var(--shadow-border),var(--shadow-card);text-decoration:none;color:inherit}\n' +
      '.diagram-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-border),var(--shadow-card-hover)}\n' +
      '.diagram-card .card-mono{flex-shrink:0;width:44px;height:44px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace;font-size:14px;font-weight:500}\n' +
      '.diagram-card .card-info{flex:1;min-width:0}\n' +
      '.diagram-card .card-name{font-size:16px;font-weight:300;letter-spacing:-0.01em;line-height:1.35}\n' +
      '.diagram-card .card-sub{font-size:11px;font-family:"JetBrains Mono",monospace;color:var(--text-muted);margin-top:1px}\n' +
      '.diagram-card .card-desc{font-size:11px;color:var(--text-secondary);font-weight:300;line-height:1.5;margin-top:6px}\n' +
      '.diagram-card .card-link{font-size:11px;color:var(--ink);font-weight:500;margin-top:6px}\n' +
      '.back-link{display:inline-block;margin-bottom:20px;font-size:13px;font-weight:300;color:var(--text-secondary);text-decoration:none;border:1px solid var(--border);padding:6px 16px;transition:all .15s}\n' +
      '.back-link:hover{border-color:var(--ink);color:var(--ink)}\n' +
      '</style>\n' +
      '<a class="back-link" href="/">\u2190 \u8FD4\u56DE\u5DE5\u5177\u67B6</a>' +
      '<div class="diagram-grid">' + cards + '</div>';

    res.send(pageShell('\u7ED3\u6784\u56FE', 'Skill \u7CFB\u7EDF\u7ED3\u6784\u56FE', body, null, diagrams.length));
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
        '  .hero-mono{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;letter-spacing:.08em;opacity:.45;margin-bottom:10px}\n' +
        '  .hero h1{font-size:min(3.6vw,4.4vh);font-weight:200;letter-spacing:-0.02em;line-height:1.15}\n' +
        '  .hero .tagline{font-size:15px;font-weight:300;opacity:.7;margin-top:10px;line-height:1.6;max-width:520px;letter-spacing:-0.01em}\n' +
        '  .content{margin:0 auto;padding:6px 32px 32px}\n' +
        '  .cat-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}\n' +
        '  .cat-pill{padding:6px 14px;font-size:12px;font-weight:400;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;letter-spacing:.03em;background:#F0F0EC;border:1px solid #E0E0DC;color:#555;cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:6px}\n' +
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
        '  .card-grip{position:absolute;top:12px;right:12px;color:#B0B0AC;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:14px;opacity:.35;line-height:1;cursor:grab;user-select:none;-webkit-user-select:none;z-index:1}\n' +
        '  .card-grip:active{cursor:grabbing}\n' +
        '  .card-mono{flex-shrink:0;width:52px;height:52px;background:#002FA7;color:#FAFAF8;display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:18px;font-weight:500;letter-spacing:.02em;margin-top:2px}\n' +
        '  .card-body{display:flex;flex-direction:column;gap:10px;min-width:0;position:relative}\n' +
        '  .card-name{font-size:18px;font-weight:300;letter-spacing:-0.01em}\n' +
        '  .card-sub{font-size:13px;font-weight:300;color:#555;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n' +
        '  .card-type-tag{position:absolute;bottom:2px;right:0;font-size:9px;font-weight:500;font-family:"JetBrains Mono","SF Mono","Consolas",monospace;letter-spacing:.04em;padding:2px 6px;opacity:.55}\n' +
        '  .tag-diagnosis{color:#002FA7;background:rgba(0,47,167,.06)}\n' +
        '  .tag-method{color:#1A8A3F;background:rgba(26,138,63,.06)}\n' +
        '  .tag-fact{color:#666;background:rgba(0,0,0,.05)}\n' +
        '  .footer{max-width:1080px;margin:0 auto;padding:36px 32px;border-top:1px solid #E0E0DC}\n' +
        '  .phil-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:#E0E0DC;margin-bottom:0}\n' +
        '  .phil-card{background:#FAFAF8;padding:24px 20px}\n' +
        '  .phil-num{font-family:"JetBrains Mono","SF Mono","Consolas",monospace;font-size:10px;font-weight:500;color:#002FA7;opacity:.45;margin-bottom:10px;letter-spacing:.04em}\n' +
        '  .phil-title{font-size:15px;font-weight:500;color:#0A0A0A;margin-bottom:6px;letter-spacing:-0.01em;line-height:1.4}\n' +
        '  .phil-body{font-size:12px;font-weight:300;color:#555;line-height:1.6}\n' +
        '  .phil-body strong{font-weight:500;color:#0A0A0A}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div class="hero"><div class="hero-inner"><a href="/" style="color:inherit;text-decoration:none;font-size:13px;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace;opacity:.5;letter-spacing:.04em">← 工具架</a><div class="hero-mono" style="margin-top:10px">OPERATIONS LOG</div><h1>操作日志</h1><div class="tagline">人+AI 共享操作记录。踩坑即记，分类即检索。</div></div></div>\n' +
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
        '<div style="max-width:1080px;margin:0 auto;padding:0 32px 24px;font-size:11px;opacity:.35;font-family:\"JetBrains Mono\",\"SF Mono\",\"Consolas\",monospace">\n' +
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

  // --- request logging (in-memory + file) ---
  var LOG_FILE = path.join(AGENTBOARD_HOME, 'state', 'api-calls.jsonl');
  var apiLog = []; // [{ts, method, path, ua, caller, action, target}]
  var apiCounts = {}; // { '/api/tools': {count, first, last}, ... } — kept for backward compat
  try { fs.mkdirSync(path.dirname(LOG_FILE), {recursive:true}); } catch(_) {}

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
    return 'admin'; // fallback
  }

  // extract tool id from path: /api/tools/start/forma → forma
  function classifyTarget(path) {
    var m = path.match(/^\/api\/tools\/(?:start|stop)\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = path.match(/^\/api\/tools\/([a-zA-Z0-9_-]+)$/);
    if (m && m[1] !== 'reorder') return m[1];
    return null;
  }

  // load existing log
  try {
    var existing = read(LOG_FILE);
    if (existing) {
      var lines = existing.trim().split('\n');
      for (var li = 0; li < lines.length; li++) {
        try { var entry = JSON.parse(lines[li]); if (entry) apiLog.push(entry); } catch(_) {}
      }
    }
  } catch(_) {}

  // rebuild counts from log (backward compat key)
  for (var ai = 0; ai < apiLog.length; ai++) {
    var e = apiLog[ai]; var k = (e.method||'GET') + ' ' + (e.path||'/');
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: e.ts, last: e.ts };
    apiCounts[k].count++; apiCounts[k].last = e.ts;
    // backfill classification for old entries
    if (!e.caller) e.caller = classifyCaller(e.ua||'');
    if (!e.action) e.action = classifyAction(e.method||'GET', e.path||'/');
    if (!e.target) e.target = classifyTarget(e.path||'/');
  }

  function logApiCall(method, p, ua) {
    var entry = {
      ts: new Date().toISOString(),
      method: method, path: p,
      ua: (ua||'').slice(0, 120),
      caller: classifyCaller(ua||''),
      action: classifyAction(method, p),
      target: classifyTarget(p)
    };
    apiLog.push(entry);
    var k = method + ' ' + p;
    if (!apiCounts[k]) apiCounts[k] = { count: 0, first: entry.ts, last: entry.ts };
    apiCounts[k].count++; apiCounts[k].last = entry.ts;
    try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8'); } catch(_) {}
  }
  app.use(function(req, res, next) {
    if (req.path.startsWith('/api/')) logApiCall(req.method, req.path, req.get('user-agent')||'');
    next();
  });

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

  // Design spec page
  app.get('/design-spec', function(req, res) {
    var md = read(path.join(PROJECT_DIR, 'design-spec.md'));
    if (!md) return res.status(500).send('design-spec.md missing');
    var html = renderMarkdown(md);
    var full = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>设计规范 · Agentboard</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'4\' fill=\'%23002FA7\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' font-family=\'Inter,sans-serif\' font-size=\'16\' font-weight=\'600\' fill=\'white\'%3E法%3C/text%3E%3C/svg%3E">\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=Noto+Sans+SC:wght@200;300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n<style>\n:root{--ink:#002FA7;--paper:#FAFAF8;--border:#E0E0DC;--text:#0A0A0A;--text-secondary:#555;--text-muted:#999;font-family:\'Inter\',\'Noto Sans SC\',sans-serif;color:var(--text);background:var(--paper);font-weight:300;font-size:16px}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh}.nav{background:var(--ink);padding:12px 24px}.nav a{color:rgba(255,255,255,.7);text-decoration:none;font-size:13px;font-weight:300}.nav a:hover{color:#fff}.nav b{color:#fff;font-weight:500;margin-right:12px}.page{max-width:800px;margin:0 auto;padding:40px 24px 80px}.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--ink);margin-bottom:24px}.page h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}.page h3{font-size:15px;font-weight:500;color:var(--text);margin:24px 0 8px}.page p,.page li{font-size:14px;line-height:1.8;color:var(--text-secondary);margin:6px 0}.page ul,.page ol{padding-left:20px;margin:8px 0}.page strong{font-weight:500;color:var(--text)}.page code{font-family:\'JetBrains Mono\',monospace;font-size:12px;background:var(--paper-tint, #F2F2F0);padding:1px 5px}.page pre{background:#f5f5f5;padding:16px;overflow-x:auto;font-size:12px;line-height:1.6;margin:12px 0}.page pre code{background:none;padding:0}.page table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}.page th,.page td{padding:8px 12px;border:1px solid var(--border);text-align:left;font-size:13px}.page th{background:var(--paper-tint, #F2F2F0);font-weight:500;font-size:12px}.page blockquote{border-left:3px solid var(--ink);margin:12px 0;padding:4px 16px;color:var(--text-secondary);font-size:13px}.page hr{border:none;border-top:1px solid var(--border);margin:24px 0}.page em{color:var(--text-secondary)}.line-count{font-size:11px;color:var(--text-muted);margin-bottom:20px;font-family:\'JetBrains Mono\',monospace}.back-link{display:inline-block;margin-top:40px;font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--border);padding:6px 16px}.back-link:hover{border-color:var(--ink)}\n</style>\n</head>\n<body>\n<div class="nav"><a href="/"><b>Agentboard</b></a> <a href="/">工具架</a> · <a href="/skills">技能</a> · <a href="/tips">操作日志</a> · <a href="/design-spec" style="color:#fff">设计规范</a> · <a href="/repo-spec">工程规范</a> · <a href="/global">全局宪法</a></div>\n<div class="page"><div class="line-count">' + md.split('\n').length + ' 行</div>\n' + html + '\n<a class="back-link" href="/">← 返回工具架</a>\n</div>\n</body>\n</html>';
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

  // Repo spec page
  app.get('/repo-spec', function(req, res) {
    var md = read(path.join(PROJECT_DIR, 'repo-spec.md'));
    if (!md) return res.status(500).send('repo-spec.md missing');
    var html = renderMarkdown(md);
    var full = pageShell('工程规范', '工程规范', html, 'repo-spec', md.split('\n').length);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

  // Global constitution (renders CLAUDE.md)
  app.get('/global', function(req, res) {
    var claudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    var md = read(claudeMdPath);
    if (!md) return res.status(500).send('CLAUDE.md not found at ' + claudeMdPath);
    var html = renderMarkdown(md);
    var full = pageShell('全局宪法', '全局宪法', html, 'global', md.split('\n').length);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

  // --- Minds (人物思维顾问) ---
  var MINDS_CATEGORIES = ['影视/创作','设计/艺术','社会/政治','教育/学习','文学/人文','科学/技术','营销/传播','商业/经济','哲学/思想','人工智能','其他'];

  app.get('/minds', function(req, res) {
    var minds = loadPerspectives();
    if (!minds.length) return res.status(500).send('perspectives not found');

    // Build category counts
    var catCounts = {};
    minds.forEach(function(m) { var c = m.category || '其他'; catCounts[c] = (catCounts[c] || 0) + 1; });

    // Category nav
    var catNav = '<div class="cat-nav" id="catNav"><button class="cat-nav-btn active" data-cat="all" onclick="setMindFilter(\'all\')">全部<span class="cnt">' + minds.length + '</span></button>';
    MINDS_CATEGORIES.forEach(function(cat) {
      if (catCounts[cat]) {
        catNav += '<button class="cat-nav-btn" data-cat="' + cat + '" onclick="setMindFilter(\'' + cat + '\')">' + cat + '<span class="cnt">' + (catCounts[cat] || 0) + '</span></button>';
      }
    });
    catNav += '</div>';

    // Card grid
    var cardsHtml = minds.map(function(ch, idx) {
      var tags = (ch.modelPills || []).slice(0, 3).map(function(m) { return '<span>' + esc(m) + '</span>'; }).join('');
      var colorIdx = idx % 5;
      var colors = ['cinnabar','azure','malachite','indigo','ochre'];
      return '<div class="mind-card" data-cat="' + esc(ch.category) + '" data-id="' + ch.id + '" onclick="location=\'/minds/' + encodeURIComponent(ch.id) + '\'">' +
        '<div class="mind-card-bar bar-' + colors[colorIdx] + '"></div>' +
        '<div class="mind-card-body">' +
          '<div class="mind-card-name">' + esc(ch.name_cn) + '</div>' +
          '<div class="mind-card-en">' + esc(ch.name_en) + '</div>' +
          '<div class="mind-card-line">' + esc(ch.oneliner) + '</div>' +
          (tags ? '<div class="mind-card-pills">' + tags + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('\n');

    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + minds.length + ' 位思维顾问 · Agentboard</title>\n<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">思</text></svg>') + '">\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=Noto+Sans+SC:wght@200;300;400;500;700&family=Noto+Serif+SC:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n<style>\n' +
      ':root{--ink:#141413;--paper:#faf9f5;--paper-tint:#f5f4ed;--cinnabar:#d97757;--cinnabar-bg:rgba(217,119,87,0.08);--azure:#5088b0;--azure-bg:rgba(80,136,176,0.08);--malachite:#509070;--malachite-bg:rgba(80,144,112,0.08);--indigo:#6058a8;--indigo-bg:rgba(96,88,168,0.08);--ochre:#b89850;--ochre-bg:rgba(184,152,80,0.08);--mono:"JetBrains Mono","IBM Plex Mono",monospace;--serif:"Noto Serif SC","Source Serif 4",Georgia,serif;--sans:"DM Sans","Noto Sans SC",system-ui,sans-serif}' +
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
      'body{background:var(--paper);color:var(--ink);font-family:"Noto Sans SC","DM Sans",system-ui,sans-serif;font-weight:400;line-height:1.7;-webkit-font-smoothing:antialiased}' +
      '.topbar{display:flex;align-items:center;gap:12px;padding:10px 24px;background:#fff;border-bottom:1px solid rgba(0,0,0,0.06);position:sticky;top:0;z-index:10}' +
      '.topbar a{font-size:13px;color:#002FA7;text-decoration:none;font-family:var(--mono);letter-spacing:.04em}' +
      '.topbar a:hover{opacity:.7}' +
      '.topbar .sep{color:rgba(0,0,0,0.15)}' +
      '.hero{padding:64px 24px 40px;text-align:center;max-width:800px;margin:0 auto}' +
      '.hero .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.15em;color:var(--cinnabar);opacity:.8;margin-bottom:20px}' +
      '.hero h1{font-family:var(--serif);font-size:clamp(2.6rem,5vw,4rem);font-weight:900;line-height:1.06;letter-spacing:-0.02em}' +
      '.hero h1 em{font-style:normal;color:var(--cinnabar)}' +
      '.hero .deck{font-size:15px;color:rgba(20,20,19,0.5);max-width:480px;margin:12px auto 0;line-height:1.7}' +
      '.cat-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:1080px;margin:0 auto 24px;padding:0 24px}' +
      '.cat-nav-btn{padding:5px 14px;font-size:12px;font-family:var(--mono);letter-spacing:.04em;background:var(--paper-tint);border:1px solid rgba(0,0,0,0.08);color:rgba(20,20,19,0.55);cursor:pointer;border-radius:20px;transition:all .15s;display:inline-flex;align-items:center;gap:5px}' +
      '.cat-nav-btn:hover{border-color:var(--cinnabar);color:var(--cinnabar)}' +
      '.cat-nav-btn.active{background:var(--ink);color:var(--paper);border-color:var(--ink)}' +
      '.cat-nav-btn .cnt{font-size:10px;opacity:.6}' +
      '.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;max-width:1200px;margin:0 auto;padding:0 24px 80px}' +
      '.mind-card{background:#fff;cursor:pointer;transition:all .25s;display:flex;flex-direction:column;border-radius:8px;border:1px solid rgba(0,0,0,0.06)}' +
      '.mind-card:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(0,0,0,0.06),0 20px 32px rgba(0,0,0,0.06);border-color:rgba(0,0,0,0.12)}' +
      '.mind-card-bar{height:3px;flex-shrink:0}' +
      '.bar-cinnabar{background:var(--cinnabar)}' +
      '.bar-azure{background:var(--azure)}' +
      '.bar-malachite{background:var(--malachite)}' +
      '.bar-indigo{background:var(--indigo)}' +
      '.bar-ochre{background:var(--ochre)}' +
      '.mind-card-body{padding:22px 24px 20px;flex:1;display:flex;flex-direction:column}' +
      '.mind-card-name{font-family:var(--serif);font-size:1.3rem;font-weight:700;color:var(--ink);line-height:1.2}' +
      '.mind-card-en{font-size:13px;color:rgba(20,20,19,0.4);font-style:italic;margin-bottom:8px}' +
      '.mind-card-line{font-size:13px;color:rgba(20,20,19,0.55);line-height:1.55;flex:1}' +
      '.mind-card-pills{margin-top:12px;display:flex;flex-wrap:wrap;gap:5px}' +
      '.mind-card-pills span{font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:10px;background:var(--paper-tint);color:rgba(20,20,19,0.45);letter-spacing:.04em}' +
      '.mind-card.hidden{display:none}' +
      '.back-link{display:inline-block;margin:40px 0 0 24px;font-size:13px;color:var(--cinnabar);text-decoration:none;font-family:var(--mono);letter-spacing:.04em}' +
      '@media(max-width:768px){.hero h1{font-size:2rem}.card-grid{grid-template-columns:1fr;padding:0 16px 60px}.hero{padding:40px 16px 28px}}' +
      '</style>\n</head>\n<body>\n' +
      '<div class="topbar"><a href="/">Agentboard</a><span class="sep">/</span><a href="/minds" style="color:var(--ink);font-weight:500">思维顾问</a><span class="sep">·</span><a href="/skills">技能</a></div>\n' +
      '<div class="hero"><div class="eyebrow">Huashu Nuwa · Perspective Catalog</div><h1>' + minds.length + ' 位人物<br><em>思维顾问</em></h1><p class="deck">女娲蒸馏产物。每个人物是独立可用的思维镜片——点击任意一张卡片，进入那个人物的操作系统。</p></div>\n' +
      catNav +
      '<div class="card-grid" id="cardGrid">' + cardsHtml + '</div>\n' +
      '<a class="back-link" href="/">← 返回工具架</a>\n' +
      '<script>\n' +
      'function setMindFilter(cat){\n' +
      '  document.querySelectorAll(".cat-nav-btn").forEach(function(b){b.classList.remove("active");});\n' +
      '  document.querySelectorAll(".cat-nav-btn").forEach(function(b){if(b.dataset.cat===cat)b.classList.add("active");});\n' +
      '  document.querySelectorAll(".mind-card").forEach(function(c){\n' +
      '    if(cat==="all"||c.dataset.cat===cat){c.classList.remove("hidden");}else{c.classList.add("hidden");}\n' +
      '  });\n' +
      '}\n' +
      '<\/script>\n' +
      '</body>\n</html>';
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  });

  // Individual mind detail
  app.get('/minds/:id', function(req, res) {
    var minds = loadPerspectives();
    var ch = null;
    for (var i = 0; i < minds.length; i++) {
      if (minds[i].id === req.params.id) { ch = minds[i]; break; }
    }
    if (!ch) return res.status(404).send('perspective not found');

    var bodyHtml = renderMarkdown(ch.body);
    var triggerBadges = (ch.trigger || '').split(',').map(function(t) {
      return '<span class="trigger-badge">' + esc(t.trim()) + '</span>';
    }).join(' ');

    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + esc(ch.name_cn) + ' · 思维顾问</title>\n' +
      '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#002FA7"/><text x="16" y="22" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" font-weight="600" fill="white">思</text></svg>') + '">\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=Noto+Sans+SC:wght@200;300;400;500;700&family=Noto+Serif+SC:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n' +
      '<style>\n' +
      ':root{--ink:#141413;--paper:#faf9f5;--paper-tint:#f5f4ed;--cinnabar:#d97757;--cinnabar-bg:rgba(217,119,87,0.08);--azure:#5088b0;--azure-bg:rgba(80,136,176,0.08);--malachite:#509070;--malachite-bg:rgba(80,144,112,0.08);--indigo:#6058a8;--indigo-bg:rgba(96,88,168,0.08);--ochre:#b89850;--ochre-bg:rgba(184,152,80,0.08);--mono:"JetBrains Mono","IBM Plex Mono",monospace;--serif:"Noto Serif SC","Source Serif 4",Georgia,serif;--sans:"DM Sans","Noto Sans SC",system-ui,sans-serif}' +
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
      'body{background:var(--paper);color:var(--ink);font-family:"Noto Sans SC","DM Sans",system-ui,sans-serif;font-weight:400;line-height:1.7;-webkit-font-smoothing:antialiased}' +
      '.topbar{display:flex;align-items:center;gap:12px;padding:10px 24px;background:#fff;border-bottom:1px solid rgba(0,0,0,0.06);position:sticky;top:0;z-index:10}' +
      '.topbar a{font-size:13px;color:#002FA7;text-decoration:none;font-family:var(--mono);letter-spacing:.04em}' +
      '.topbar a:hover{opacity:.7}' +
      '.detail-hero{max-width:760px;margin:0 auto;padding:48px 24px 28px;border-bottom:1px solid rgba(0,0,0,0.08)}' +
      '.detail-hero .dh-name{font-family:var(--serif);font-size:clamp(2rem,4vw,3.2rem);font-weight:900;line-height:1.06;letter-spacing:.01em;margin-bottom:8px}' +
      '.detail-hero .dh-en{font-size:1rem;color:rgba(20,20,19,0.4);font-style:italic;margin-bottom:12px}' +
      '.detail-hero .dh-line{font-family:var(--serif);font-size:1.05rem;color:rgba(20,20,19,0.6);line-height:1.55;margin-bottom:16px}' +
      '.trigger-strip{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px}' +
      '.trigger-badge{font-family:var(--mono);font-size:10px;padding:3px 10px;border-radius:12px;background:var(--paper-tint);color:rgba(20,20,19,0.45);border:1px solid rgba(0,0,0,0.06);letter-spacing:.04em}' +
      '.detail-body{max-width:760px;margin:0 auto;padding:32px 24px 80px}' +
      '.detail-body h1{font-family:var(--serif);font-size:1.8rem;font-weight:700;color:var(--ink);margin:40px 0 16px;letter-spacing:.01em;line-height:1.25}' +
      '.detail-body h1:first-child{margin-top:0}' +
      '.detail-body h2{font-family:var(--serif);font-size:1.25rem;font-weight:700;color:var(--ink);margin:36px 0 12px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.08);line-height:1.35}' +
      '.detail-body h3{font-family:var(--serif);font-size:1.05rem;font-weight:600;color:var(--ink);margin:24px 0 8px;line-height:1.4}' +
      '.detail-body p{font-size:15px;line-height:1.85;color:rgba(20,20,19,0.75);margin:10px 0}' +
      '.detail-body ul,.detail-body ol{padding-left:24px;margin:10px 0}' +
      '.detail-body li{font-size:14px;line-height:1.85;color:rgba(20,20,19,0.7);margin:4px 0}' +
      '.detail-body blockquote{border-left:3px solid var(--cinnabar);padding:8px 20px;margin:16px 0;color:rgba(20,20,19,0.6);font-family:var(--serif);font-size:1rem;line-height:1.7;background:var(--cinnabar-bg);border-radius:0 8px 8px 0}' +
      '.detail-body code{font-family:var(--mono);font-size:12px;background:var(--paper-tint);padding:1px 6px;border-radius:3px;color:var(--cinnabar)}' +
      '.detail-body pre{background:#1e1e1e;color:#e0e0e0;padding:20px 24px;overflow-x:auto;font-size:13px;line-height:1.6;margin:16px 0;border-radius:8px}' +
      '.detail-body pre code{background:none;padding:0;color:inherit;font-size:12px}' +
      '.detail-body hr{border:none;border-top:1px solid rgba(0,0,0,0.08);margin:36px 0}' +
      '.detail-body strong{font-weight:600;color:var(--ink)}' +
      '.detail-body em{color:rgba(20,20,19,0.55)}' +
      '.detail-body table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}' +
      '.detail-body th,.detail-body td{padding:8px 14px;text-align:left;border:1px solid rgba(0,0,0,0.08)}' +
      '.detail-body th{background:var(--paper-tint);font-weight:500;font-size:12px;font-family:var(--mono);letter-spacing:.04em}' +
      '.back-link{display:inline-block;margin-top:32px;font-size:13px;color:var(--cinnabar);text-decoration:none;font-family:var(--mono);letter-spacing:.04em;border:1px solid rgba(0,0,0,0.1);padding:6px 16px;border-radius:6px}' +
      '.back-link:hover{border-color:var(--cinnabar)}' +
      '@media(max-width:768px){.detail-hero{padding:32px 16px 24px}.detail-body{padding:20px 16px 60px}.detail-hero .dh-name{font-size:1.6rem}.detail-body h1{font-size:1.4rem}.detail-body h2{font-size:1.15rem}.detail-body pre{padding:14px 16px}}' +
      '</style>\n</head>\n<body>\n' +
      '<div class="topbar"><a href="/">Agentboard</a><span class="sep">/</span><a href="/minds">思维顾问</a><span class="sep">/</span><a style="color:var(--ink);font-weight:500">' + esc(ch.name_cn) + '</a></div>\n' +
      '<div class="detail-hero">' +
      '<h1 class="dh-name">' + esc(ch.name_cn) + '</h1>' +
      '<div class="dh-en">' + esc(ch.name_en) + '</div>' +
      '<div class="dh-line">' + esc(ch.oneliner) + '</div>' +
      '<div class="trigger-strip">' + triggerBadges + '</div>' +
      '</div>\n' +
      '<div class="detail-body">' + bodyHtml + '\n<a class="back-link" href="/minds">← 返回思维顾问目录</a>\n</div>\n' +
      '</body>\n</html>';
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html);
  });

  function pageShell(title, heading, body, active, lines) {
    return '<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\n<title>' + esc(title) + ' · Agentboard</title>\n<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'4\' fill=\'%23002FA7\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' font-family=\'Inter,sans-serif\' font-size=\'16\' font-weight=\'600\' fill=\'white\'%3E法%3C/text%3E%3C/svg%3E">\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&family=Noto+Sans+SC:wght@200;300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap\" rel=\"stylesheet\">\n<style>\n:root{--ink:#002FA7;--ink-rgb:0,47,167;--paper:#FAFAF8;--paper-tint:#F2F2F0;--border:#E0E0DC;--text:#0A0A0A;--text-secondary:#555;--text-muted:#999;--shadow-border:0 0 0 1px rgba(0,0,0,0.08);--shadow-card:0 1px 3px rgba(0,0,0,0.06);--shadow-card-hover:0 2px 8px rgba(0,0,0,0.1);font-family:\'Inter\',\'Noto Sans SC\',sans-serif;color:var(--text);background:var(--paper);font-weight:300;font-size:16px}*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh}.header{background:var(--ink);padding:14px 32px;display:flex;align-items:center;gap:24px}.header-brand{font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:500;letter-spacing:.06em;color:var(--paper);text-decoration:none;white-space:nowrap;opacity:.9}.header-back{font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:400;color:var(--paper);text-decoration:none;opacity:.7;margin-left:auto;transition:opacity .15s}.header-back:hover{opacity:1}.page{max-width:1080px;margin:0 auto;padding:40px 32px 80px}.page h1{font-size:28px;font-weight:200;letter-spacing:-0.02em;color:var(--ink);margin-bottom:24px}.page h2{font-size:18px;font-weight:500;color:var(--text);margin:36px 0 12px;padding-top:16px;border-top:1px solid var(--border)}.page h3{font-size:15px;font-weight:500;color:var(--text);margin:24px 0 8px}.page p,.page li{font-size:14px;line-height:1.8;color:var(--text-secondary);margin:6px 0}.page ul,.page ol{padding-left:20px;margin:8px 0}.page strong{font-weight:500;color:var(--text)}.page code{font-family:\'JetBrains Mono\',monospace;font-size:12px;background:var(--paper-tint);padding:1px 5px}.page pre{background:#f5f5f5;padding:16px;overflow-x:auto;font-size:12px;line-height:1.6;margin:12px 0}.page pre code{background:none;padding:0}.page table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}.page th,.page td{padding:8px 12px;border:1px solid var(--border);text-align:left;font-size:13px}.page th{background:var(--paper-tint);font-weight:500;font-size:12px}.page blockquote{border-left:3px solid var(--ink);margin:12px 0;padding:4px 16px;color:var(--text-secondary);font-size:13px}.page hr{border:none;border-top:1px solid var(--border);margin:24px 0}.page em{color:var(--text-secondary)}.line-count{font-size:11px;color:var(--text-muted);margin-bottom:20px;font-family:\'JetBrains Mono\',monospace}.back-link{display:inline-block;margin-top:40px;font-size:13px;color:var(--ink);text-decoration:none;border:1px solid var(--border);padding:6px 16px}.back-link:hover{border-color:var(--ink)}\n</style>\n</head>\n<body>\n<div class=\"header\"><a class=\"header-brand\" href=\"/\">AGENTBOARD</a><a class=\"header-back\" href=\"/\">&#8592; 返回工具架</a></div>\n<div class=\"page\"><div class=\"line-count\">' + (lines || '') + ' 行</div>\n' + body + '\n</div>\n</body>\n</html>';
  }

  function renderMarkdown(md) {
    md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = md.split('\n');
    var out = '';
    var inCode = false, inTable = false, inList = false, inBlockquote = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // code blocks
      if (line.startsWith('```')) {
        if (inCode) { out += '</code></pre>\n'; inCode = false; }
        else { var lang = line.slice(3).trim(); out += '<pre><code' + (lang ? ' class="language-' + esc(lang) + '"' : '') + '>'; inCode = true; }
        continue;
      }
      if (inCode) { out += esc(line) + '\n'; continue; }
      // tables
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) { inTable = true; out += '<table>\n'; }
        var isSep = /^\|[\s\-:]+\|$/.test(line);
        if (isSep) continue;
        var cells = line.slice(1, -1).split('|').map(function(c) { return c.trim(); });
        var tag = inTable && out.indexOf('</table>') === -1 && out.lastIndexOf('<tr>') === -1 ? 'th' : 'td';
        out += '<tr>' + cells.map(function(c) { return '<' + tag + '>' + renderInline(c) + '</' + tag + '>'; }).join('') + '</tr>\n';
        continue;
      } else if (inTable) {
        out += '</table>\n';
        inTable = false;
      }
      // blockquotes
      if (line.startsWith('> ')) {
        if (!inBlockquote) { inBlockquote = true; out += '<blockquote>\n'; }
        out += renderInline(line.slice(2)) + '<br>\n';
        continue;
      } else if (inBlockquote) {
        out += '</blockquote>\n';
        inBlockquote = false;
      }
      // headings
      if (line.startsWith('### ')) { out += '<h3>' + renderInline(line.slice(4)) + '</h3>\n'; continue; }
      if (line.startsWith('## ')) { out += '<h2 id="' + slug(line.slice(3)) + '">' + renderInline(line.slice(3)) + '</h2>\n'; continue; }
      if (line.startsWith('# ')) { out += '<h1>' + renderInline(line.slice(2)) + '</h1>\n'; continue; }
      // hr
      if (/^\-{3,}$/.test(line.trim())) { out += '<hr>\n'; continue; }
      // lists
      var listM = line.match(/^(\s*)[\-*]\s+(.*)/);
      if (listM) {
        if (!inList) { inList = true; out += '<ul>\n'; }
        out += '<li>' + renderInline(listM[2]) + '</li>\n';
        continue;
      }
      var olM = line.match(/^(\s*)\d+\.\s+(.*)/);
      if (olM) {
        if (!inList) { inList = true; out += '<ol>\n'; }
        out += '<li>' + renderInline(olM[2]) + '</li>\n';
        continue;
      }
      if (inList) { out += (out.lastIndexOf('<ol>') > out.lastIndexOf('<ul>') ? '</ol>\n' : '</ul>\n'); inList = false; }
      // paragraph
      if (line.trim()) { out += '<p>' + renderInline(line) + '</p>\n'; }
    }
    if (inCode) out += '</code></pre>\n';
    if (inTable) out += '</table>\n';
    if (inList) out += '</ul>\n';
    if (inBlockquote) out += '</blockquote>\n';
    return out;
  }

  function renderInline(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/✅/g, '<span style="color:#1A8A3F">✅</span>')
      .replace(/❌/g, '<span style="color:#C0392B">❌</span>')
      .replace(/⬜/g, '<span style="color:var(--text-muted)">⬜</span>');
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-|-$/g, '');
  }

  // Startup items page
    // Startup items page
  app.get('/startup', function(req, res) {
    var startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    var items = [];
    try {
      var files = fs.readdirSync(startupDir);
      files.forEach(function(f) {
        if (f === 'desktop.ini') return;
        var fp = path.join(startupDir, f);
        var stat = fs.statSync(fp);
        items.push({ name: f.replace(/\.(lnk|bat|vbs|ps1)$/i, ''), file: f, path: fp, source: '启动文件夹', size: stat.size, mtime: stat.mtime.toISOString() });
      });
    } catch(_) {}
    try {
      var abs = ['.bat', '.vbs', '.ps1'];
      var agentFiles = fs.readdirSync(PROJECT_DIR).filter(function(f) { return abs.indexOf(path.extname(f).toLowerCase()) !== -1; });
      agentFiles.forEach(function(f) {
        var fp = path.join(PROJECT_DIR, f);
        var stat = fs.statSync(fp);
        items.push({ name: f.replace(/\.(bat|vbs|ps1)$/i, ''), file: f, path: fp, source: 'Agentboard', size: stat.size, mtime: stat.mtime.toISOString() });
      });
    } catch(_) {}
    var rows = items.map(function(item) {
      var ext = path.extname(item.file).toLowerCase();
      var typeLabel = ext === '.lnk' ? '快捷方式' : ext === '.bat' ? '批处理' : ext === '.vbs' ? 'VBScript' : ext === '.ps1' ? 'PowerShell' : '文件';
      return '<tr><td><strong>' + esc(item.name) + '</strong></td><td><code>' + typeLabel + '</code></td><td style="font-size:11px;color:var(--text-muted)">' + esc(item.source) + '</td><td style="font-family:JetBrains Mono,monospace;font-size:11px">' + esc(item.file) + '</td></tr>';
    }).join('');
    var body = '<p class="sub">开机自启动的应用和脚本。添加：把 .bat/.vbs 快捷方式放入 <code>Startup</code> 文件夹。Agentboard 启动脚本放 <code>~/.agentboard/</code>。</p>' +
      (items.length ? '<table><tr><th>名称</th><th>类型</th><th>来源</th><th>文件</th></tr>' + rows + '</table>' : '<p>暂无启动项</p>');
    var full = pageShell('启动项', '启动项', body, 'startup', items.length);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(full);
  });

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
    var designSpecLines = (read(path.join(PROJECT_DIR, 'design-spec.md')) || '').split('\n').length;
    var repoSpecLines = (read(path.join(PROJECT_DIR, 'repo-spec.md')) || '').split('\n').length;
    var globalLines = (read(path.join(os.homedir(), '.claude', 'CLAUDE.md')) || '').split('\n').length;
    var apiEndpoints = 0;
    try { app._router.stack.forEach(function(r){ if (r.route && r.route.path && r.route.path.indexOf('/api/') === 0) apiEndpoints++; }); } catch(_) {}
    var cronTasks = (function(){
      try { var raw = read(path.join(PROJECT_DIR, 'cron', 'tasks.json')); return raw ? JSON.parse(raw).tasks.length : 0; } catch(_) { return 0; }
    })();
    var startupCount = (function(){
      var n = 0;
      try {
        var sd = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        if (fs.existsSync(sd)) fs.readdirSync(sd).forEach(function(f){ if (f !== 'desktop.ini') n++; });
      } catch(_) {}
      try {
        var abs = ['.bat', '.vbs', '.ps1'];
        fs.readdirSync(PROJECT_DIR).forEach(function(f){ if (abs.indexOf(path.extname(f).toLowerCase()) !== -1) n++; });
      } catch(_) {}
      return n;
    })();
    var snap = JSON.stringify({
      todayCalls: tdy,
      byCaller: { agent: tc.agent||0, browser: tc.browser||0, unknown: tc.unknown||0 },
      byAction: { list: ta.list||0, control: (ta.control||0)+(ta.detail||0), admin: ta.admin||0 },
      assets: { tools: assetToolCount, skills: assetSkillCount, commands: assetCommandCount, tips: assetTipCount, designSpec: designSpecLines, repoSpec: repoSpecLines, global: globalLines, api: apiEndpoints, cron: cronTasks, startup: startupCount, minds: loadPerspectives().length }
    });
    html = html.replace('<!--STATS_SNAPSHOT-->', '<script>window.__stats=' + snap + '</script>');
    res.type('html').send(html);
  });

  app.use(express.static(PROJECT_DIR));

  var PORT = process.env.PORT || 3099;
  app.listen(PORT, function() {
    console.log('Agentboard http://localhost:' + PORT);
  });
}

if (require.main === module) {
  startServer();
}
