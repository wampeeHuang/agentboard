// MCP (Model Context Protocol) server for agentboard
// JSON-RPC 2.0 over stdio — AI-native tool protocol
// Human visibility: http://localhost:3099/ (REST API + Dashboard)
// Shared truth: ~/.agentboard/tools/*/manifest.json
// Core logic: lib/tool-registry.js (唯一真相源)

var readline = require('readline');
var registry = require('./lib/tool-registry');

// ── MCP Tool definitions ──

var TOOL_DEFS = [
  {
    name: 'agentboard_list_tools',
    description: '列出 agentboard 上所有已注册工具，含运行状态、分类、端口、描述、capability。用此工具发现有哪些工具可用，然后再启动或调用。可按分类或 ID 筛选。',
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
    description: '创建新工具并写入 manifest.json。写入前自动校验 schema（必填字段、owner 枚举、capability 长度等），不通过则驳回并返回具体错误。必填字段: id, name, description(须含【用途】), capability(≤30字), owner(自建/外部/AI托管)。type 默认为 service，可选 service/command/folder/group。category 必须是已存在的分类(先调 list_tools 看现有分类)。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '工具 ID，字母开头，仅含 a-z 0-9 - _' },
        name: { type: 'string', description: '显示名称' },
        description: { type: 'string', description: '描述，须含【用途】段' },
        capability: { type: 'string', description: '一句话能力描述，≤30 字' },
        owner: { type: 'string', description: '所有者: 自建, 外部, AI托管' },
        category: { type: 'string', description: '分类名。必须先调 list_tools 查看已有分类，勿自创' },
        type: { type: 'string', description: '卡片类型: service(默认), command, folder, group。选错=无按钮' },
        port: { type: 'number', description: '端口号' },
        url: { type: 'string', description: '运行时 URL。有 URL 才有"打开"按钮' },
        projectPath: { type: 'string', description: '项目路径' },
        startCommand: { type: 'string', description: '启动命令。service 类型+有端口时必填' },
        stopCommand: { type: 'string', description: '停止命令' },
        icon: { type: 'string', description: '图标 emoji' },
        conflicts: { type: 'array', items: { type: 'string' }, description: '冲突工具 ID 列表' },
        agent_notes: { type: 'string', description: 'AI 踩坑笔记' }
      },
      required: ['id', 'name', 'description', 'capability', 'owner']
    }
  },
  {
    name: 'agentboard_update_tool',
    description: '更新已有工具的 manifest 字段。只更新传入的字段，其他保持不变。写入前同样跑 schema 校验。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '要更新的工具 ID' },
        name: { type: 'string', description: '新的显示名称' },
        description: { type: 'string', description: '新的描述' },
        capability: { type: 'string', description: '新的一句话能力描述' },
        owner: { type: 'string', description: '所有者' },
        category: { type: 'string', description: '分类名' },
        type: { type: 'string', description: '卡片类型' },
        port: { type: 'number', description: '端口号' },
        url: { type: 'string', description: '运行时 URL' },
        projectPath: { type: 'string', description: '项目路径' },
        startCommand: { type: 'string', description: '启动命令' },
        stopCommand: { type: 'string', description: '停止命令' },
        icon: { type: 'string', description: '图标 emoji' },
        conflicts: { type: 'array', items: { type: 'string' }, description: '冲突工具 ID 列表' },
        agent_notes: { type: 'string', description: 'AI 踩坑笔记' }
      },
      required: ['id']
    }
  }
];

// ── Tool call handlers ──

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
      port: t.port, ports: t.ports, capability: t.capability || '',
      hasStartCommand: !!t.startCommand, hasStopCommand: !!t.stopCommand,
      conflicts: t.conflicts
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
  var result = registry.createTool(args);
  if (result.ok) return textResult('Created: ' + args.id + '\n' + JSON.stringify(result.tool, null, 2));
  return textResult('Failed: ' + result.error, true);
}

function handleUpdateTool(args) {
  if (!args || !args.id) return textResult('Error: id is required', true);
  var result = registry.updateTool(args.id, args);
  if (result.ok) return textResult('Updated: ' + args.id + '\n' + JSON.stringify(result.tool, null, 2));
  return textResult('Failed: ' + result.error, true);
}

var TOOL_HANDLERS = {
  'agentboard_list_tools': handleListTools,
  'agentboard_get_tool': handleGetTool,
  'agentboard_start_tool': handleStartTool,
  'agentboard_stop_tool': handleStopTool,
  'agentboard_create_tool': handleCreateTool,
  'agentboard_update_tool': handleUpdateTool
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
