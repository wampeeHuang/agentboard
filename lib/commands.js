// commands.js — Claude Code 斜杠命令：源提取(claude.exe) × agent 二次加构(commands.json)
// 源 = 安装的 claude.exe 里的命令对象 {type,name,description,...}，提取 best-effort（字段顺序不定、getter 形式、部分命令不在二进制）
// 注册表 = state/commands.json，agent 补注（分类/中文名/中文说明）；未检出命令变灰不删，用户可手动删
var fs = require('fs');
var path = require('path');

// 种子：原 BUILTIN_COMMANDS（42 条已人工分类），首次运行迁入 state/commands.json
var SEED_COMMANDS = [
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

module.exports = function (AGENTBOARD_HOME) {
  var STATE_DIR = path.join(AGENTBOARD_HOME, 'state');
  var REG_PATH = path.join(STATE_DIR, 'commands.json');
  var SRC_PATH = path.join(STATE_DIR, 'commands-source.json');
  var EXE = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe') : null;
  var sourceCache = null;

  function writeAtomic(p, content) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    var tmp = p + '.tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, p);
  }

  // 从 claude.exe 提取命令对象（name + description）。字段顺序不定（description 前可隔字段）、getter 形式、type 可在 name 后。
  function extractFromBinary() {
    var commands = [];
    if (!EXE || !fs.existsSync(EXE)) return commands;
    var whole = fs.readFileSync(EXE, 'latin1');
    var seen = {};
    var re = /name:"([a-z0-9][a-z0-9-]*)"/g;
    var m;
    while ((m = re.exec(whole))) {
      var name = m[1];
      if (seen[name]) continue;
      var win = whole.slice(Math.max(0, m.index - 220), m.index + 280);
      if (!/type:"(local|local-jsx|prompt)"|source:"builtin"/.test(win)) continue;
      seen[name] = true;
      var desc = '';
      var dm = win.match(/description:"((?:\\.|[^"\\])*)"/);
      if (dm) desc = dm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      commands.push({ name: name, description: desc });
    }
    commands.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return commands;
  }

  // 源缓存：claude.exe mtime 变了才重提取；进程内 + 磁盘双缓存
  function readCommandsSource() {
    if (EXE && fs.existsSync(EXE)) {
      var mt = fs.statSync(EXE).mtimeMs;
      if (sourceCache && sourceCache.mtime === mt) return sourceCache;
      try {
        var cached = JSON.parse(fs.readFileSync(SRC_PATH, 'utf8'));
        if (cached && cached.mtime === mt && Array.isArray(cached.commands)) { sourceCache = cached; return cached; }
      } catch (_) {}
      var commands = extractFromBinary();
      sourceCache = { mtime: mt, commands: commands, extractedAt: new Date().toISOString() };
      try { writeAtomic(SRC_PATH, JSON.stringify(sourceCache)); } catch (_) {}
      return sourceCache;
    }
    return { mtime: 0, commands: [] };
  }

  function readRegistry() {
    try {
      var a = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
      if (Array.isArray(a)) return a;
    } catch (_) {}
    var seed = SEED_COMMANDS.map(function (c) { return { name: c.trigger, category: c.cat, displayName: c.name, description: c.desc }; });
    try { writeAtomic(REG_PATH, JSON.stringify(seed)); } catch (_) {}
    return seed;
  }
  function writeRegistry(rows) { try { writeAtomic(REG_PATH, JSON.stringify(rows)); } catch (_) {} }

  // 合并视图：已标注(found) → 未标注(unann) → 未检出(miss 灰末尾)
  function buildRows() {
    var src = readCommandsSource().commands;
    var reg = readRegistry();
    var srcMap = {}; src.forEach(function (s) { srcMap[s.name] = s; });
    var regMap = {}; reg.forEach(function (r) { regMap[r.name] = r; });
    var found = [], miss = [];
    reg.forEach(function (r) {
      var s = srcMap[r.name];
      var row = { name: r.name, category: r.category || '', displayName: r.displayName || r.name, description: r.description || '', sourceDesc: s ? s.description : '', annotated: true, inSource: !!s };
      (s ? found : miss).push(row);
    });
    var unann = src.filter(function (s) { return !regMap[s.name]; })
      .map(function (s) { return { name: s.name, category: '', displayName: '', description: '', sourceDesc: s.description, annotated: false, inSource: true }; });
    function byName(a, b) { return a.name < b.name ? -1 : 1; }
    found.sort(byName); unann.sort(byName); miss.sort(byName);
    return found.concat(unann).concat(miss);
  }

  function upsertCommand(row) {
    var reg = readRegistry();
    var i = -1;
    for (var k = 0; k < reg.length; k++) if (reg[k].name === row.name) { i = k; break; }
    var entry = { name: row.name, category: row.category, displayName: row.displayName, description: row.description };
    if (i >= 0) reg[i] = entry; else reg.push(entry);
    writeRegistry(reg);
    return { ok: true, name: row.name };
  }

  // 删除 = 去掉二次标注：注册表条目移除，源里还在的命令回未标注桶，可再标。不留隐藏名单。
  function removeCommand(name) {
    var reg = readRegistry();
    var before = reg.length;
    reg = reg.filter(function (r) { return r.name !== name; });
    if (reg.length !== before) writeRegistry(reg);
    return { ok: true };
  }

  return {
    SEED_COMMANDS: SEED_COMMANDS,
    readCommandsSource: readCommandsSource,
    readRegistry: readRegistry,
    buildRows: buildRows,
    upsertCommand: upsertCommand,
    removeCommand: removeCommand,
    sourceCount: function () { return readCommandsSource().commands.length; }
  };
};
