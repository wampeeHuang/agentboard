// lib/manifest-schema.js — manifest 标准唯一真相源
// 被 tool-registry.js (写入校验) 和 mcp-server.js (巡检) 共享

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');

var PLATFORM = process.platform;

// ── 字段定义 ──

var REQUIRED_ALL = ['name', 'description', 'capability', 'owner', 'category'];
var REQUIRED_SERVICE = ['startCommand', 'stopCommand'];
var OWNER_VALUES = ['自建', '外部', 'AI托管'];
var TYPE_VALUES = ['service', 'cli', 'folder', 'group'];
var CATEGORY_VALUES = ['本地模型', '远程模型', 'Agent', '设施', '获取', '查阅', '创作', '职能', '工作区'];

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
    scent: ['API', '云端', '聚合', '中继', '在线', '远程', '端点', 'API key', 'token用量'],
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
    scent: ['目录', '画廊', 'catalog', 'gallery', 'viewer', '查阅资料', '参考手册', '百科', '索引', '只读浏览'],
    anti: '有编辑/创作功能的归"创作"，不归"查阅"。查阅 = 只读消费'
  },
  '创作': {
    desc: '内容创作、生成、设计、编辑工具',
    scent: ['生成内容', '设计工具', '编辑工具', '写作', '绘图', '视频制作', '音频处理', '混音', '排版', '品牌设计', '图像编辑'],
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
  }
};

var FIELD_RULES = {
  name:        { type: 'string', minLen: 1, label: '显示名称' },
  description: { type: 'string', minLen: 10, pattern: /【用途】/, label: '描述(需含【用途】)' },
  capability:  { type: 'string', minLen: 2, maxLen: 30, label: '一句话任务描述' },
  owner:       { type: 'enum', values: OWNER_VALUES, label: '所有者' },
  port:        { type: 'number', label: '端口' },
  ports:       { type: 'array', label: '多端口' },
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

  var hasPort = mf.port || (mf.ports && mf.ports.length > 0);
  if ((mf.type || 'service') === 'service' && hasPort) {
    REQUIRED_SERVICE.forEach(function (f) {
      if (!mf[f]) errors.push('service 类型缺少: ' + f + ' (' + FIELD_RULES[f].label + ')');
    });
  }

  if (mf.port && !/^\d+$/.test(String(mf.port))) errors.push('port 应为数字');
  if (mf.ports && !Array.isArray(mf.ports)) errors.push('ports 应为数组');

  if (!mf.agent_notes) warnings.push('建议填写 agent_notes（AI 踩坑笔记）');

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

// ── schema 合规巡检 ──

function auditAll(dirs) {
  var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(require('os').homedir(), '.agentboard');
  var DEFAULT_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
  var searchDirs = (dirs && dirs.length > 0) ? dirs : [DEFAULT_DIR];

  var issues = [];
  var total = 0;
  var totalErrors = 0;
  var totalWarnings = 0;

  searchDirs.forEach(function (dir) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(function (e) {
      if (!e.isDirectory() || e.name.startsWith('.')) return;
      var mfPath = path.join(dir, e.name, 'manifest.json');
      if (!fs.existsSync(mfPath)) return;
      total++;
      var mf;
      try { mf = JSON.parse(fs.readFileSync(mfPath, 'utf8')); } catch (_) {
        issues.push({ id: e.name, errors: ['manifest.json 不是合法 JSON'], warnings: [] });
        totalErrors++;
        return;
      }
      var result = validate(mf);
      if (result.errors.length > 0 || result.warnings.length > 0) {
        issues.push({ id: e.name, name: mf.name || '', errors: result.errors, warnings: result.warnings });
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
      }
    });
  });

  issues.sort(function (a, b) { return b.errors.length - a.errors.length || b.warnings.length - a.warnings.length; });
  return { ok: totalErrors === 0, total: total, errors: totalErrors, warnings: totalWarnings, issues: issues };
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
      if (!e.isDirectory() || e.name.startsWith('.')) return;

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
      if (!e.isDirectory() || e.name.startsWith('.')) return;
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

module.exports = {
  REQUIRED_ALL: REQUIRED_ALL,
  REQUIRED_SERVICE: REQUIRED_SERVICE,
  OWNER_VALUES: OWNER_VALUES,
  TYPE_VALUES: TYPE_VALUES,
  CATEGORY_VALUES: CATEGORY_VALUES,
  CATEGORY_DEFINITIONS: CATEGORY_DEFINITIONS,
  FIELD_RULES: FIELD_RULES,
  validate: validate,
  crossValidateCategory: crossValidateCategory,
  auditAll: auditAll,
  auditRuntime: auditRuntime,
  auditOrphans: auditOrphans
};
