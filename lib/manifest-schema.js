// lib/manifest-schema.js — manifest 标准唯一真相源
// 被 tool-registry.js (写入校验) 和 lib/mcp-http.js (MCP 巡检) 共享

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');

var PLATFORM = process.platform;

// 系统运行目录——tools/ 下非工具的运行时产物（_runtime 写 checkpoint），扫描时跳过
var SYSTEM_DIRS = ['_runtime'];

// ── 字段定义 ──

var REQUIRED_ALL = ['name', 'description', 'capability', 'category', 'conflicts'];
var REQUIRED_SERVICE = ['startCommand', 'stopCommand'];
var OWNER_VALUES = ['自建', '外部'];
var TYPE_VALUES = ['service', 'cli', 'api', 'folder', 'group'];
var CATEGORY_VALUES = ['本地模型', '远程模型', 'Agent', '设施', '获取', '查阅', '创作', '职能', '工作区', '公开站'];

// ── 分类定义 (frontmatter — 校验门禁第一步: AI 必须先读此块再赋 category) ──
// 每项含: desc(一句话定义), scent(命中该类的关键词), anti(容易误归进来的反例)
var CATEGORY_DEFINITIONS = {
  '本地模型': {
    desc: '本地运行的 AI 模型、GPU 推理进程、可启动的模型服务端点',
    scent: ['本地部署', 'GPU推理', '本地模型', '模型服务端点', '本地serving', '视觉模型', '文生图', '本地运行'],
    anti: '必须是有本地进程可启动的模型服务。远程 API 调用归"远程模型"不归此类'
  },
  '远程模型': {
    desc: '远程 AI 模型 API、云端推理、聚合中继、不占本地 GPU 的模型端点',
    scent: ['云端', '聚合', '中继', '在线', '远程', '端点', 'API key', 'token用量'],
    anti: '无本地进程，纯 API 调用。本地可启动模型归"本地模型"不归此类'
  },
  'Agent': {
    desc: '自主 Agent、多步任务执行、工具调用机器人',
    scent: ['自主Agent', '多步任务', '编排Agent', 'orchestrator', '自主决策', '任务编排', 'Agent协作'],
    anti: '不是所有自动化脚本。必须有自主决策+多步执行能力的 Agent'
  },
  '设施': {
    desc: '基础设施、服务器、数据库、存储、部署运维',
    scent: ['Docker', 'nginx', '部署运维', 'cron调度', '消息队列', '缓存服务', '组网', '代理服务'],
    anti: '不是工具运行需要的环境，而是管理基础设施的工具本身'
  },
  '获取': {
    desc: '数据抓取、爬虫、API 客户端、信息提取',
    scent: ['抓取', '爬虫', 'scraper', '数据提取', '数据采集', '拉取数据', '同步数据', '导入数据'],
    anti: '浏览/查看类归"查阅"，不归"获取"。获取 = 主动拉数据进来'
  },
  '查阅': {
    desc: '只读浏览、查看、目录、画廊、参考资料',
    scent: ['目录', '画廊', 'catalog', 'gallery', 'viewer', '查阅资料', '参考手册', '百科', '索引', '只读浏览', '总览', '策展', '信息源'],
    anti: '有编辑/创作功能的归"创作"，不归"查阅"。查阅 = 只读消费'
  },
  '创作': {
    desc: '内容创作、生成、设计、编辑工具',
    scent: ['生成内容', '设计工具', '编辑工具', '写作', '绘图', '视频制作', '音频处理', '混音', '排版', '品牌设计', '图像编辑', '分镜', '图生视频', '剪映'],
    anti: '只读浏览归"查阅"。创作 = 产出新内容'
  },
  '职能': {
    desc: '业务职能工具、领域专用（财务/人事/行政/运营）',
    scent: ['财务', '人事', '行政', '报销', '审批', '考勤', '税务', 'HR系统', '业务运营'],
    anti: '通用工具不归此类，必须是绑定特定业务职能的'
  },
  '工作区': {
    desc: '开发工作区、IDE、编码环境、项目管理',
    scent: ['编辑器', '开发环境', 'workspace', '项目管理', '看板', 'issue跟踪', '代码仓库'],
    anti: '不是所有开发工具。必须是提供完整工作区/IDE 界面的'
  },
  '公开站': {
    desc: '已部署到公网的项目/站点，用户的对外可访问成果',
    scent: ['公开站', '部署', '公网', '域名', 'Vercel', '网站', '静态站', '生产环境', '线上'],
    anti: '必须是已部署到公网可访问的站点。纯本地工具不归此类。工具架子域名归此类'
  }
};

var FIELD_RULES = {
  name:        { type: 'string', minLen: 1, label: '显示名称' },
  description: { type: 'string', minLen: 10, pattern: /【用途】[\s\S]*【何时用】|【何时用】[\s\S]*【用途】/, label: '描述(需含【用途】【何时用】)' },
  capability:  { type: 'string', minLen: 2, maxLen: 30, label: '一句话任务描述' },
  owner:       { type: 'enum', values: OWNER_VALUES, label: '所有者(可选)' },
  port:        { type: 'number', label: '端口' },
  ports:       { type: 'array', label: '多端口' },
  conflicts:   { type: 'array', label: '互斥工具 id（GPU 独占：comfyui/stable-diffusion/minicpm-v/ace-step；无冲突留空数组）' },
  startCommand:{ type: 'string', minLen: 1, label: '启动命令' },
  stopCommand: { type: 'string', minLen: 1, label: '停止命令' },
  category:    { type: 'string', label: '分类' },
  url:         { type: 'string', label: '运行时URL' },
  projectPath: { type: 'string', label: '项目路径' },
  agent_notes: { type: 'string', label: 'AI踩坑笔记' },
  type:        { type: 'enum', values: TYPE_VALUES, label: '卡片类型' },
  disabled:    { type: 'boolean', label: '已停用' },
  runtime:     { type: 'object', label: '运行时', props: {
    language: { type: 'enum', values: ['python','node','go','rust','cpp','csharp','ruby','java','shell','other'], label: '语言' },
    version:  { type: 'string', label: '版本号' },
    manager:  { type: 'enum', values: ['pip','npm','pnpm','yarn','cargo','go-mod','bundler','maven','none'], label: '包管理器' },
    note:     { type: 'string', label: '备注' }
  } }
};

// ── 辅助函数 ──

function expandEnvVars(p) {
  if (!p) return p;
  return p.replace(/%([^%]+)%/g, function (_, name) {
    return process.env[name] || '%' + name + '%';
  });
}

function winPath(p) {
  if (!p) return p;
  p = expandEnvVars(p);
  var m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}

var SHELL_BUILTINS = [
  'cd', 'chdir', 'dir', 'echo', 'set', 'rem', 'md', 'mkdir', 'rd', 'rmdir',
  'del', 'erase', 'copy', 'move', 'ren', 'rename', 'type', 'cls', 'exit',
  'pushd', 'popd', 'call', 'start', 'title', 'path', 'prompt', 'color',
  'date', 'time', 'verify', 'vol', 'label', 'subst', 'if', 'for', 'goto'
];
var PS_CMDLET_RE = /^[A-Z][a-zA-Z]+-[A-Z][a-zA-Z]+$/;

function isShellBuiltin(exe) {
  return SHELL_BUILTINS.indexOf(exe.toLowerCase()) >= 0 || PS_CMDLET_RE.test(exe);
}

function parseMainExe(cmd) {
  if (!cmd) return null;
  var parts = cmd.split(/&&|\|\||\|/);
  var last = parts[parts.length - 1].trim();
  var match = last.match(/^"([^"]+)"|^(\S+)/);
  if (!match) return null;
  var exe = match[1] || match[2];
  return (exe && !isShellBuiltin(exe)) ? exe : null;
}

function checkExeExists(exe, projectPathWin) {
  var exeExpanded = expandEnvVars(exe);
  if (fs.existsSync(exeExpanded)) return true;
  if (projectPathWin) {
    var absInProject = path.join(projectPathWin, exeExpanded);
    if (fs.existsSync(absInProject)) return true;
    if (!path.extname(exeExpanded) && fs.existsSync(absInProject + '.exe')) return true;
  }
  try {
    var whichCmd = PLATFORM === 'win32' ? 'where' : 'which';
    child_process.execSync(whichCmd + ' "' + exeExpanded.replace(/"/g, '\\"') + '"', {
      timeout: 3000, encoding: 'utf8', windowsHide: true
    });
    return true;
  } catch (_) { return false; }
}

// ── 校验单个 manifest ──

function validate(mf) {
  var errors = [];
  var warnings = [];

  if (!mf || typeof mf !== 'object') return { ok: false, errors: ['manifest is not an object'], warnings: [] };

  REQUIRED_ALL.forEach(function (f) {
    if (!mf[f]) errors.push('缺少必填字段: ' + f + ' (' + FIELD_RULES[f].label + ')');
  });

  if (mf.owner && OWNER_VALUES.indexOf(mf.owner) === -1) {
    errors.push('owner 值无效: "' + mf.owner + '"，合法值: ' + OWNER_VALUES.join('|'));
  }

  if (mf.type && TYPE_VALUES.indexOf(mf.type) === -1) {
    errors.push('type 值无效: "' + mf.type + '"，合法值: ' + TYPE_VALUES.join('|') + '。选错=卡片无按钮');
  }

  if (mf.category && CATEGORY_VALUES.indexOf(mf.category) === -1) {
    errors.push('category 值无效: "' + mf.category + '"，合法值: ' + CATEGORY_VALUES.join('|'));
  }

  // 分类语义校验 (门禁第二步: keyword 交叉验证 — 检查描述词是否指向其他分类)
  if (mf.category && CATEGORY_VALUES.indexOf(mf.category) !== -1) {
    var catWarnings = crossValidateCategory(mf);
    warnings = warnings.concat(catWarnings);
  }

  if (mf.capability && mf.capability.length > 30) {
    warnings.push('capability 超长: ' + mf.capability.length + ' 字符 (建议≤30)');
  }

  // 描述三段式：用途+何时用 必填（何时不用/返回 为推荐）
  if (mf.description && !/【用途】[\s\S]*【何时用】|【何时用】[\s\S]*【用途】/.test(mf.description)) {
    errors.push('description 需同时含【用途】与【何时用】段');
  }

  // 描述不得重复槽位事实：端口只住 manifest port 字段，写两处必漂移
  if (mf.description && /【端口】/.test(mf.description)) {
    warnings.push('描述含【端口】与端口槽位重复——端口只写 manifest port 字段');
  }

  var hasPort = mf.port || (mf.ports && mf.ports.length > 0);
  if ((mf.type || 'service') === 'service' && hasPort) {
    REQUIRED_SERVICE.forEach(function (f) {
      if (!mf[f]) errors.push('service 类型缺少: ' + f + ' (' + FIELD_RULES[f].label + ')');
    });
  }

  if (mf.port && !/^\d+$/.test(String(mf.port))) errors.push('port 应为数字');
  if (mf.ports && !Array.isArray(mf.ports)) errors.push('ports 应为数组');

  // conflicts 槽位统一：REQUIRED_ALL 已强制字段存在，此处校验格式
  if (mf.conflicts !== undefined && !Array.isArray(mf.conflicts)) {
    errors.push('conflicts 应为数组（互斥工具 id 列表，无冲突写空数组 []）');
  } else if (Array.isArray(mf.conflicts)) {
    mf.conflicts.forEach(function (c) {
      if (typeof c !== 'string') errors.push('conflicts 元素应为字符串（工具 id），发现: ' + JSON.stringify(c));
    });
  }

  if (!mf.agent_notes) warnings.push('建议填写 agent_notes（AI 踩坑笔记）');

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

// ── schema 合规巡检 ──

function auditAll(dirs) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var issues = [];
  var items = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.') || SYSTEM_DIRS.indexOf(e.name) >= 0) return;
      var mfPath = path.join(dir, e.name, 'manifest.json');
      if (!fs.existsSync(mfPath)) return;
      total++;
      var mf;
      try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (_) {
        var bad = { id: e.name, name: '', errors: ['manifest.json 不是合法 JSON'], warnings: [] };
        issues.push(bad);
        items.push(bad);
        totalErrors++;
        return;
      }
      var result = validate(mf);
      items.push({ id: e.name, name: mf.name || '', errors: result.errors, warnings: result.warnings });
      if (result.errors.length > 0 || result.warnings.length > 0) {
        issues.push({ id: e.name, name: mf.name || '', errors: result.errors, warnings: result.warnings });
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
      }
    });
  });

  issues.sort(function (a, b) { return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length; });
  return { ok: totalErrors === 0, total: total, errors: totalErrors, warnings: totalWarnings, issues: issues, items: items };
}

// ── 运行时漂移检测 ──
// 检查 manifest 声明与文件系统/进程表的实际状态是否一致。
// 检查项是写死的——不加抽象的间接层。要加新检查直接加代码。

function auditRuntime(dirs, listeningPorts) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var issues = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }

    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.') || SYSTEM_DIRS.indexOf(e.name) >= 0) return;

      var mfPath = path.join(dir, e.name, 'manifest.json');

      // 孤儿目录
      if (!fs.existsSync(mfPath)) {
        issues.push({ id: e.name, name: e.name, errors: ['孤儿目录: 工具目录存在但无 manifest.json'], warnings: [] });
        totalErrors++;
        total++;
        return;
      }

      total++;

      var mf;
      try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (_) { return; }

      var errors = [];
      var warnings = [];

      // projectPath 存在性
      if (mf.projectPath) {
        var ppWin = winPath(mf.projectPath);
        if (!fs.existsSync(ppWin)) errors.push('projectPath 不存在: ' + mf.projectPath);
      }

      // startCommand 可执行文件
      if (mf.startCommand) {
        var exe = parseMainExe(mf.startCommand);
        if (exe) {
          var ppWin = mf.projectPath ? winPath(mf.projectPath) : null;
          if (!checkExeExists(exe, ppWin))
            errors.push('startCommand 可执行文件缺失: ' + exe + ' (不在 PATH 也不在项目目录)');
        }
      }

      // stopCommand 可执行文件
      if (mf.stopCommand) {
        var stopExe = parseMainExe(mf.stopCommand);
        if (stopExe && stopExe !== parseMainExe(mf.startCommand || '')) {
          var ppWin = mf.projectPath ? winPath(mf.projectPath) : null;
          if (!checkExeExists(stopExe, ppWin))
            warnings.push('stopCommand 可执行文件缺失: ' + stopExe);
        }
      }

      // 端口监听
      if (listeningPorts && listeningPorts.size > 0) {
        var allPorts = (mf.ports && mf.ports.length > 0) ? mf.ports : (mf.port ? [mf.port] : []);
        allPorts.forEach(function (p) {
          if (!listeningPorts.has(p))
            warnings.push('声明端口 ' + p + ' 未在监听 (工具可能已停止)');
        });
      }

      if (errors.length > 0 || warnings.length > 0) {
        issues.push({ id: e.name, name: mf.name || e.name, errors: errors, warnings: warnings });
        totalErrors += errors.length;
        totalWarnings += warnings.length;
      }
    });
  });

  issues.sort(function (a, b) { return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length; });
  return { ok: totalErrors === 0, total: total, errors: totalErrors, warnings: totalWarnings, issues: issues };
}

// ── 分类语义交叉校验 (门禁第二步) ──
// 从 name + capability + description 提取关键词，与 CATEGORY_DEFINITIONS 做匹配打分。
// 如果最高分指向的分类 ≠ 声明分类，发出 WARNING 并引用定义原文，倒逼 AI 重读 frontmatter。

// 词边界匹配: 防止子串误命中 (如 "pullmd" 匹配 "llm")
// 规则: 关键词前后必须是非字母数字字符 (空格/标点/CJK/行首/行尾)
function matchTerm(text, keyword) {
  var idx = text.indexOf(keyword);
  if (idx === -1) return false;
  var before = idx === 0 ? ' ' : text.charAt(idx - 1);
  var after = idx + keyword.length >= text.length ? ' ' : text.charAt(idx + keyword.length);
  return !/[a-zA-Z0-9]/.test(before) && !/[a-zA-Z0-9]/.test(after);
}

function crossValidateCategory(mf) {
  var textStr = ((mf.name || '') + ' ' + (mf.capability || '') + ' ' + (mf.description || '')).toLowerCase();
  var declared = mf.category;
  var scores = {};
  var totalHits = 0;

  Object.keys(CATEGORY_DEFINITIONS).forEach(function (cat) {
    var hits = 0;
    var def = CATEGORY_DEFINITIONS[cat];
    def.scent.forEach(function (kw) {
      if (matchTerm(textStr, kw.toLowerCase())) hits++;
    });
    scores[cat] = hits;
    totalHits += hits;
  });

  // 无关键词命中 → 无法判断，放行
  if (totalHits === 0) return [];

  // 找最高分分类
  var bestCat = null;
  var bestScore = -1;
  Object.keys(scores).forEach(function (cat) {
    if (scores[cat] > bestScore) {
      bestScore = scores[cat];
      bestCat = cat;
    }
  });

  // 声明分类得分最高 → 通过
  if (bestCat === declared) return [];

  // 声明分类得了 0 分，但其他分类有命中 → 强警告
  var declaredScore = scores[declared] || 0;
  var def = CATEGORY_DEFINITIONS[bestCat];
  var declaredDef = CATEGORY_DEFINITIONS[declared];

  var matchedWords = def.scent.filter(function (k) { return matchTerm(textStr, k.toLowerCase()); });

  if (declaredScore === 0 && bestScore > 0) {
    return [
      '【分类门禁】声明的 category="' + declared + '" (' + declaredDef.desc + ')，' +
      '但名称/描述中的关键词全部指向 category="' + bestCat + '" (' + def.desc + ')。' +
      '命中词: ' + matchedWords.join('、') + '。' +
      '请对照 CATEGORY_DEFINITIONS 重新选择分类，或确认这是否是误判。'
    ];
  }

  // 声明分类有命中但不是最高 → 弱警告
  if (declaredScore > 0 && bestScore > declaredScore) {
    return [
      '【分类门禁】声明的 category="' + declared + '" 得分 ' + declaredScore + '，' +
      '但 category="' + bestCat + '" 得分 ' + bestScore + ' (' + def.desc + ')。' +
      '命中词: ' + matchedWords.join('、') + '。' +
      '请确认是否选对了最贴切的分类。'
    ];
  }

  return [];
}

// ── 孤儿目录检测 ──
// 检查 tools/*/ 下每个目录是否都有 manifest.json
function auditOrphans(dirs) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var orphans = [];
  var total = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.') || SYSTEM_DIRS.indexOf(e.name) >= 0) return;
      total++;
      var mfPath = path.join(dir, e.name, 'manifest.json');
      if (!fs.existsSync(mfPath)) {
        orphans.push({ id: e.name, name: e.name });
      }
    });
  });

  var errors = orphans.length;
  return { ok: errors === 0, total: total, errors: errors, orphans: orphans };
}

// ── 表单契约（唯一真相源：dashboard 工具表单从这里渲染，禁止前端手写字段副本） ──
// input id = f-*（填表/收集读同一 id）；section = 分区（自动编号 1..6）；
// cg = 类型门控容器（applyFormType 切显隐，id = cg-{cg}）；row = 同行分组（≥3→row3，2→row2）；
// formTypes = 该字段生效的卡片类型；newOnly = 仅新建显示输入框（编辑锁定为目录名）。

var FORM_TYPES = [
  { value: 'service', label: '服务 — 常驻后台', title: '常驻后台进程，可启动停止。含本地 API 服务。' },
  { value: 'cli',     label: '命令 — 用完就走', title: '用完就走的一次性命令，在 Claude Code 里用 /触发词 调用。' },
  { value: 'api',     label: 'API — 外部服务',  title: '外部供应商服务，本地无进程，只填 API 地址 + 密钥，不可启动停止。' },
  { value: 'folder',  label: '文件夹 — 项目目录', title: '项目目录，不可运行，点开直接看项目。' },
  { value: 'group',   label: '组 — 多工具编排',  title: '多个工具的编排。' }
];

// 分类 → 建议类型（suggestType 用：选完自动建议，可改）
var CAT_SUGGEST = {
  '本地模型': 'service', '远程模型': 'api', 'Agent': 'service', '创作': 'service',
  '获取': 'api', '职能': 'cli', '设施': 'service', '查阅': 'service',
  '工作区': 'folder', '公开站': 'folder'
};

var CATEGORY_OPTIONS = CATEGORY_VALUES.map(function (c) {
  return { value: c, label: c, title: (CATEGORY_DEFINITIONS[c] && CATEGORY_DEFINITIONS[c].desc) || '' };
});
var RUNTIME_OPTIONS = FIELD_RULES.runtime.props.language.values.map(function (v) { return v; });

var TOOL_FIELDS = [
  // ── 身份 ──
  { key: 'name', input: 'f-name', label: '名字', type: 'text', required: true, placeholder: '例：MiniCPM-V 4.6', tooltip: '必填，≥2 字', row: 'id', section: '身份' },
  { key: 'id', input: 'f-id', label: 'ID', type: 'text', newOnly: true, placeholder: '小写英文+连字符，例：minicpm-v', tooltip: '必填，agent 用它定位 tools/{id}/。只能小写英文 + 数字 + 连字符（a-z 0-9 -），字母开头。建议直接用工具名做 ID（如 comfyui、deepseek-api），中文/大写会难倒 agent。', row: 'id', section: '身份' },
  { key: 'version', input: 'f-version', label: '版本', type: 'display', displayHtml: '<div class="auto-val" id="f-version" title="原型：无版本数据">—</div>', row: 'id', section: '身份' },
  { key: 'icon', input: 'f-icon', label: '图标', type: 'icon', placeholder: '例：🖼️（空 = 用名字首字）', tooltip: 'emoji 图标，卡片 Header 显示。空 = 用名字首字', section: '身份' },

  // ── 功能 ──
  { key: 'description', input: 'f-func', label: '功能一句话', type: 'textarea', rows: 2, required: true, placeholder: '例：本地视觉模型，理解图片内容（OCR / 描述 / 问答）。', tooltip: '必填，≥10 字', section: '功能' },

  // ── 分类 ──
  { key: 'category', input: 'f-category', label: '分类', type: 'select', options: CATEGORY_OPTIONS, required: true, onchange: 'suggestType()', row: 'cls', section: '分类' },
  { key: 'type', input: 'f-form', label: '类型', type: 'select', options: FORM_TYPES, required: true, onchange: 'applyFormType()', row: 'cls', section: '分类' },
  { key: 'dims', label: '派生展示（自动，从类型推导）', type: 'display', displayHtml: '<div class="auto-val" style="gap:16px"><span id="f-dims-loc"></span><span id="f-dims-acc"></span></div>', section: '分类' },

  // ── 调用方式（cg 门控） ──
  { key: 'port', input: 'f-port', label: '端口', type: 'text', placeholder: '例：8080', cg: 'service', formTypes: ['service'], row: 'srv1', section: '调用方式' },
  { key: 'url', input: 'f-url', label: '页面 URL', type: 'text', placeholder: '例：http://localhost:8080', cg: 'service', formTypes: ['service'], row: 'srv1', section: '调用方式' },
  { key: 'apiBase', input: 'f-api', label: 'API 地址', type: 'text', placeholder: '例：…/v1/chat/completions', cg: 'service', formTypes: ['service'], row: 'srv1', section: '调用方式' },
  { key: 'startCommand', input: 'f-start', label: '启动命令', type: 'text', required: true, placeholder: '例：node server.js', cg: 'service', formTypes: ['service'], row: 'srv2', section: '调用方式' },
  { key: 'stopCommand', input: 'f-stop', label: '停止命令', type: 'text', placeholder: '例：node stop.js', cg: 'service', formTypes: ['service'], row: 'srv2', section: '调用方式' },
  { key: 'projectPath', input: 'f-path', label: '项目路径', type: 'text', placeholder: '例：D:\\tools\\minicpm-v', tooltip: '进程工作目录', cg: 'service', formTypes: ['service'], section: '调用方式' },

  { key: 'trigger', input: 'f-trigger', label: '触发词', type: 'text', placeholder: '例：/clip（无触发词的 CLI 可留空）', cg: 'cli', formTypes: ['cli'], row: 'cli1', section: '调用方式' },
  { key: 'startCommand', input: 'f-start-cli', label: '启动命令', type: 'text', placeholder: '例：node run.js', cg: 'cli', formTypes: ['cli'], row: 'cli1', section: '调用方式' },
  { key: 'projectPath', input: 'f-path-cli', label: '项目路径', type: 'text', placeholder: '例：D:\\tools\\some-cli', tooltip: '命令所在目录', cg: 'cli', formTypes: ['cli'], section: '调用方式' },

  { key: 'apiBase', input: 'f-api-api', label: 'API 地址', type: 'text', required: true, placeholder: '例：https://api.openai.com/v1/chat/completions', cg: 'api', formTypes: ['api'], row: 'api1', section: '调用方式' },
  { key: 'apiKeyName', input: 'f-keyname', label: '密钥名', type: 'text', placeholder: '例：OPENAI_API_KEY', cg: 'api', formTypes: ['api'], row: 'api1', section: '调用方式' },
  { key: 'url', input: 'f-url-api', label: '文档 URL', type: 'text', placeholder: '例：https://platform.openai.com/docs', cg: 'api', formTypes: ['api'], row: 'api1', section: '调用方式' },

  { key: 'projectPath', input: 'f-path-folder', label: '项目路径', type: 'text', required: true, placeholder: '例：D:\\workspace\\gallery', tooltip: '文件夹没有端口没有命令，项目路径就是它', cg: 'folder', formTypes: ['folder'], section: '调用方式' },

  { key: 'children', input: 'f-children', label: '子工具', type: 'textarea', rows: 3, required: true, placeholder: '📖 认知深读日报 —— cron-认知深读\n📡 AI信号日报 —— cron-AI信号', tooltip: '组 = 多个工具的编排。每行一个子工具，格式：名字 —— 触发词', cg: 'group', formTypes: ['group'], section: '调用方式' },

  // ── 何时调用 ──
  { key: 'whenUse', input: 'f-when', label: '何时用', type: 'textarea', rows: 2, placeholder: '例：需要理解图片内容时。', row: 'when', section: '何时调用' },
  { key: 'whenNot', input: 'f-whennot', label: '何时不用', type: 'textarea', rows: 2, placeholder: '例：生成图片 → 用 ComfyUI。', row: 'when', section: '何时调用' },

  // ── 运维 ──
  { key: 'runtime', input: 'f-runtime', label: '运行时', type: 'select', options: RUNTIME_OPTIONS, tooltip: '下拉防拼错', cg: 'ops-path', formTypes: ['service', 'cli'], section: '运维' },
  { type: 'note', note: 'API / 组 无本地进程：没有项目路径、没有运行时。', cg: 'ops-none', formTypes: ['api', 'group'], section: '运维' },
  { key: 'agent_notes', input: 'f-notes', label: 'Agent 操作笔记', type: 'textarea', rows: 2, placeholder: '例：截图任务会误判端口；启动前先看 conflicts。', tooltip: '选填，记录模型在此工具上易犯的错', section: '运维' },
  { key: 'conflicts', input: 'f-conflicts', label: '冲突工具', type: 'text', placeholder: '例：comfyui,stable-diffusion（GPU 显存互斥）。留空 = 无冲突（落盘空数组）', tooltip: '互斥工具 id，逗号分隔。AI 启动本工具前会检查这些工具是否在跑', section: '运维' },
  { key: 'autoStart', input: 'f-autostart', label: '开机自动启动', type: 'checkbox', rowId: 'autoStart-row', tooltip: '服务类型：开机自动启动。停用时此项隐藏', section: '运维' },
  { key: 'disabled', input: 'f-disabled', label: '停用', type: 'checkbox', rowId: 'disabled-row', tooltip: '勾上后 AI 不可调用，同时强制取消开机自启', onchange: 'applyFormType()', section: '运维' }
];

module.exports = {
  REQUIRED_ALL: REQUIRED_ALL,
  REQUIRED_SERVICE: REQUIRED_SERVICE,
  OWNER_VALUES: OWNER_VALUES,
  TYPE_VALUES: TYPE_VALUES,
  CATEGORY_VALUES: CATEGORY_VALUES,
  CATEGORY_DEFINITIONS: CATEGORY_DEFINITIONS,
  FIELD_RULES: FIELD_RULES,
  FORM_TYPES: FORM_TYPES,
  CAT_SUGGEST: CAT_SUGGEST,
  TOOL_FIELDS: TOOL_FIELDS,
  validate: validate,
  crossValidateCategory: crossValidateCategory,
  auditAll: auditAll,
  auditRuntime: auditRuntime,
  auditOrphans: auditOrphans
};
