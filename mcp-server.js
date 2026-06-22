// MCP (Model Context Protocol) server for agentboard
// JSON-RPC 2.0 over stdio — AI-native tool protocol
// Human visibility: http://localhost:3099/ (REST API + Dashboard)
// Shared truth: ~/.agentboard/tools/*/manifest.json
// Core logic: lib/tool-registry.js (唯一真相源)

var readline = require('readline');
var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var registry = require('./lib/tool-registry');

// ── MCP Tool definitions ──

var TOOL_DEFS = [
  {
    name: 'agentboard_list_tools',
    description: '列出 agentboard 上所有已注册工具，含运行状态、分类、端口、描述。用此工具发现有哪些工具可用，然后再启动或调用。可按分类或 ID 筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按分类筛选: 模型, Agent, 设施, 获取, 查阅, 创作, 职能' },
        id: { type: 'string', description: '按工具 ID 筛选' }
      }
    }
  },
  {
    name: 'agentboard_get_tool',
    description: '获取单个工具的详细信息，含完整描述、启动/停止命令、端口、冲突、agent_notes（AI 踩坑笔记）。启动工具前必须先读此信息，检查 conflicts 和 agent_notes。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '工具 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'agentboard_start_tool',
    description: '启动一个工具。启动前自动检测端口冲突——如果所需端口被其他运行中的工具占用，返回冲突信息。启动成功后工具在后台运行。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要启动的工具 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'agentboard_stop_tool',
    description: '停止一个正在运行的工具。执行 manifest 中定义的 stopCommand。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要停止的工具 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'agentboard_create_tool',
    description: '在 agentboard 上注册一个新工具。创建 ~/.agentboard/tools/{id}/manifest.json。id 必须以小写字母开头，只含 a-z 0-9 - _。必填: id, name。可选: description, icon, category, port, ports, startCommand, stopCommand, projectPath, url, publicUrl, owner, type, trigger, agent_notes。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '工具 ID，小写字母开头，只含 a-z 0-9 - _' },
        name: { type: 'string', description: '显示名称' },
        description: { type: 'string', description: '用途/何时用/何时不用/返回/延迟/端口' },
        category: { type: 'string', description: '分类: 模型, Agent, 设施, 获取, 查阅, 创作, 职能' },
        port: { type: 'number', description: '服务端口' },
        ports: { type: 'array', items: { type: 'number' }, description: '多端口' },
        startCommand: { type: 'string', description: '启动命令' },
        stopCommand: { type: 'string', description: '停止命令' },
        projectPath: { type: 'string', description: '工作目录' },
        url: { type: 'string', description: '运行时 URL' },
        publicUrl: { type: 'string', description: '公网域名' },
        owner: { type: 'string', description: '所有者: 外部|自建|内部|AI托管' },
        type: { type: 'string', description: '类型: service|cli|folder|group' },
        trigger: { type: 'string', description: 'CLI 触发词' },
        agent_notes: { type: 'string', description: 'AI 踩坑笔记' },
        icon: { type: 'string', description: '图标 emoji 或单字符' },
        version: { type: 'string', description: 'Semver 版本号' },
        order: { type: 'number', description: '排序权重' },
        dashboard: { type: 'object', description: 'Dashboard 注册: { route, title, render, source, api, subRoutes, stats }' }
      },
      required: ['id', 'name']
    }
  },
  {
    name: 'agentboard_update_tool',
    description: '更新已有工具的 manifest 字段（部分更新）。只传要改的字段。id 不可更改。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要更新的工具 ID' },
        name: { type: 'string', description: '显示名称' },
        description: { type: 'string' },
        category: { type: 'string' },
        port: { type: 'number' },
        ports: { type: 'array', items: { type: 'number' } },
        startCommand: { type: 'string' },
        stopCommand: { type: 'string' },
        projectPath: { type: 'string' },
        url: { type: 'string' },
        publicUrl: { type: 'string' },
        owner: { type: 'string' },
        type: { type: 'string' },
        trigger: { type: 'string' },
        agent_notes: { type: 'string' },
        icon: { type: 'string' },
        version: { type: 'string' },
        order: { type: 'number' },
        conflicts: { type: 'array', items: { type: 'string' }, description: '互斥工具 ID 列表' },
        dashboard: { type: 'object', description: 'Dashboard 注册: { route, title, render, source, api, subRoutes, stats }' }
      },
      required: ['id']
    }
  },
  {
    name: 'agentboard_create_cron_task',
    description: '【用途】创建新的定时任务，写入 scheduler 的 SQLite 数据库。\n【何时用】需要新建定时任务（日报/巡检/运维），指定执行器、模型、cron 表达式和提示词。\n【何时不用】修改已有任务用 agentboard_update_cron_task。仅查看任务用浏览器打开 http://localhost:3100/cron。\n【返回】创建的任务 JSON，含 id。\n【端口】3100（scheduler HTTP）',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '任务名称，显示在卡片上' },
        description: { type: 'string', description: '一句话描述任务用途' },
        category: { type: 'string', enum: ['日报', '巡检', '运维'], description: '功能分类' },
        project_id: { type: 'string', description: '归属项目: data.evopearl.com, 税无忧, 保障房, 个体户, 深圳求职, loop-engine, system, _' },
        cron_expr: { type: 'string', description: '5字段cron表达式（分 时 日 月 周）或 once:YYYYMMDDTHHMMSS 一次性任务' },
        executor: { type: 'string', enum: ['agent', 'shell'], description: '执行器类型。agent=AI模型执行prompt，shell=执行command' },
        model: { type: 'string', enum: ['deepseek-v4-pro', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'], description: 'AI模型。仅executor=agent时需要' },
        prompt: { type: 'string', description: '发给AI的完整指令。executor=agent时必填' },
        command: { type: 'string', description: 'Shell命令。executor=shell时必填' },
        timeout_sec: { type: 'number', description: '超时秒数，默认300' },
        enabled: { type: 'boolean', description: '是否启用，默认true' }
      },
      required: ['name', 'category', 'project_id', 'cron_expr', 'executor']
    }
  },
  {
    name: 'agentboard_update_cron_task',
    description: '【用途】更新已有定时任务（部分更新），只传要改的字段。\n【何时用】修改任务的执行频率、模型、提示词、启用状态等。\n【何时不用】创建新任务用 agentboard_create_cron_task。\n【返回】更新后的任务 JSON。\n【端口】3100（scheduler HTTP）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '任务 ID（数字）' },
        name: { type: 'string', description: '任务名称' },
        description: { type: 'string', description: '任务描述' },
        category: { type: 'string', enum: ['日报', '巡检', '运维'] },
        project_id: { type: 'string' },
        cron_expr: { type: 'string', description: '5字段cron或once:时间戳' },
        executor: { type: 'string', enum: ['agent', 'shell'] },
        model: { type: 'string', enum: ['deepseek-v4-pro', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] },
        prompt: { type: 'string' },
        command: { type: 'string' },
        timeout_sec: { type: 'number' },
        enabled: { type: 'boolean' }
      },
      required: ['id']
    }
  }
];

// ── Tool call handlers (thin — delegate to registry) ──

function textResult(text, isError) {
  var r = { content: [{ type: 'text', text: text }] };
  if (isError) r.isError = true;
  return r;
}

function handleListTools(args) {
  var tools = registry.scanTools();
  if (args && args.category) tools = tools.filter(function (t) { return t.category === args.category; });
  if (args && args.id) tools = tools.filter(function (t) { return t.id === args.id; });
  var summary = tools.map(function (t) {
    return {
      id: t.id, name: t.name, category: t.category || '', running: t.running,
      port: t.port, ports: t.ports, description: (t.description || '').substring(0, 300),
      hasStartCommand: !!t.startCommand, hasStopCommand: !!t.stopCommand,
      conflicts: t.conflicts, agent_notes: t.agent_notes ? t.agent_notes.substring(0, 200) : '',
      dashboard: t.dashboard
    };
  });
  return textResult(JSON.stringify(summary, null, 2));
}

function handleGetTool(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var tool = registry.getTool(args.id);
  if (!tool) return textResult('Error: tool not found: ' + args.id, true);
  return textResult(JSON.stringify(tool, null, 2));
}

function handleStartTool(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var result = registry.startTool(args.id);
  if (result.ok) return textResult('Started: ' + args.id);
  return textResult('Failed to start ' + args.id + ': ' + result.error, true);
}

function handleStopTool(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var result = registry.stopTool(args.id);
  if (result.ok) return textResult('Stopped: ' + args.id);
  return textResult('Failed to stop ' + args.id + ': ' + result.error, true);
}

function handleCreateTool(args) {
  if (!args || !args.id || !args.name) return textResult('Error: id and name are required', true);
  if (!/^[a-z][a-z0-9_-]*$/.test(args.id)) return textResult('Error: id must start with a letter, contain only a-z 0-9 - _', true);
  var result = registry.createTool(args);
  if (result.ok) return textResult('Created tool: ' + args.id + ' (' + args.name + ')');
  return textResult('Error: ' + result.error, true);
}

function handleUpdateTool(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var result = registry.updateTool(args.id, args);
  if (result.ok) return textResult('Updated tool: ' + args.id);
  return textResult('Error: ' + result.error, true);
}

// ── Cron task helpers (call scheduler REST API via temp-file PowerShell) ──

var TMP = path.join(os.tmpdir(), 'agentboard-mcp-cron');

function cronApi(method, path_, body) {
  if (body) {
    try { fs.mkdirSync(path.dirname(TMP), { recursive: true }); } catch (_) {}
    fs.writeFileSync(TMP, JSON.stringify(body), 'utf-8');
  }
  var ps = '[System.Net.ServicePointManager]::Expect100Continue = $false; ' +
    '$r = Invoke-RestMethod -Uri "http://127.0.0.1:3100' + path_ + '" -Method ' + method + ' -ContentType "application/json"' +
    (body ? ' -Body ([System.IO.File]::ReadAllText("' + TMP.replace(/\\/g, '\\\\') + '"))' : '') +
    '; ConvertTo-Json -Compress -Depth 10 -InputObject $r';
  try {
    var out = cp.execSync('powershell -NoProfile -NonInteractive -Command "' + ps.replace(/"/g, '\\"') + '"', { encoding: 'utf-8', timeout: 8000 });
    if (out.trim()) return { ok: true, data: out.trim() };
    return { ok: false, error: 'empty response' };
  } catch (e) {
    var errMsg = (e.stderr || e.message || '').toString().substring(0, 500);
    if (errMsg.indexOf('{"') !== -1 || errMsg.indexOf('"id":') !== -1) return { ok: true, data: errMsg };
    return { ok: false, error: errMsg };
  }
}

function handleCreateCronTask(args) {
  if (!args || !args.name || !args.category || !args.project_id || !args.cron_expr || !args.executor) {
    return textResult('Error: name, category, project_id, cron_expr, executor are required', true);
  }
  if (args.executor === 'agent' && !args.prompt) return textResult('Error: prompt is required when executor=agent', true);
  if (args.executor === 'shell' && !args.command) return textResult('Error: command is required when executor=shell', true);
  var body = {
    name: args.name, description: args.description || '', category: args.category,
    project_id: args.project_id, project_dir: '_', cron_expr: args.cron_expr,
    executor: args.executor, model: args.executor === 'agent' ? (args.model || '') : '',
    prompt: args.executor === 'shell' ? (args.command || '') : (args.prompt || ''),
    timeout_sec: args.timeout_sec || 300,
    enabled: args.enabled !== false ? 1 : 0
  };
  var result = cronApi('POST', '/api/cron/tasks', body);
  return handleCronResult(result);
}

function handleUpdateCronTask(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var body = {};
  var fields = ['name','description','category','project_id','cron_expr','executor','model','prompt','command','timeout_sec','enabled'];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (args[f] !== undefined) {
      if (f === 'enabled') body[f] = args[f] ? 1 : 0;
      else if (f === 'command') body.prompt = args[f];
      else body[f] = args[f];
    }
  }
  if (args.executor === 'shell' && !body.prompt && !args.prompt) body.prompt = args.command;
  var result = cronApi('PUT', '/api/cron/tasks/' + args.id, body);
  return handleCronResult(result);
}

function handleCronResult(result) {
  if (!result.ok) return textResult('Scheduler API unreachable: ' + result.error + '. Is scheduler running on port 3100?', true);
  try {
    var d = JSON.parse(result.data);
    if (d.error) return textResult('Error: ' + d.error, true);
  } catch (_) {}
  return textResult(result.data);
}

var TOOL_HANDLERS = {
  'agentboard_list_tools': handleListTools,
  'agentboard_get_tool': handleGetTool,
  'agentboard_start_tool': handleStartTool,
  'agentboard_stop_tool': handleStopTool,
  'agentboard_create_tool': handleCreateTool,
  'agentboard_update_tool': handleUpdateTool,
  'agentboard_create_cron_task': handleCreateCronTask,
  'agentboard_update_cron_task': handleUpdateCronTask
};

// ── JSON-RPC handlers ──

function handleInitialize(id) {
  return {
    jsonrpc: '2.0', id: id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agentboard', version: '1.0.0' }
    }
  };
}

function handleToolsList(id) {
  return { jsonrpc: '2.0', id: id, result: { tools: TOOL_DEFS } };
}

function handleToolsCall(id, params) {
  var name = params && params.name;
  var args = params && params.arguments;
  if (!name) return { jsonrpc: '2.0', id: id, error: { code: -32602, message: 'Missing tool name' } };
  var handler = TOOL_HANDLERS[name];
  if (!handler) return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Unknown tool: ' + name } };
  try {
    var result = handler(args);
    return { jsonrpc: '2.0', id: id, result: result };
  } catch (e) {
    return { jsonrpc: '2.0', id: id, error: { code: -32603, message: e.message } };
  }
}

function handlePing(id) {
  return { jsonrpc: '2.0', id: id, result: {} };
}

var METHOD_HANDLERS = {
  'initialize': handleInitialize,
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
  'ping': handlePing
};

// ── Main loop ──

var rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });

rl.on('line', function (line) {
  line = line.trim();
  if (!line) return;

  var msg;
  try { msg = JSON.parse(line); } catch (_) { return; }

  if (msg.method && !msg.id) return; // notification — no response

  if (msg.method && msg.id != null) {
    var handler = METHOD_HANDLERS[msg.method];
    if (!handler) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found: ' + msg.method } }) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify(handler(msg.id, msg.params)) + '\n');
  }
});

rl.on('close', function () { process.exit(0); });

process.stderr.write('[mcp-server] agentboard MCP server ready (stdio)\n');
