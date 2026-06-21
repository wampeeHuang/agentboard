// MCP (Model Context Protocol) server for agentboard
// JSON-RPC 2.0 over stdio — AI-native tool protocol
// Human visibility: http://localhost:3099/ (REST API + Dashboard)
// Shared truth: ~/.agentboard/tools/*/manifest.json

var fs = require('fs');
var path = require('path');
var os = require('os');
var readline = require('readline');
var child_process = require('child_process');

var AGENTBOARD_HOME = process.env.AGENTBOARD_HOME || path.join(os.homedir(), '.agentboard');
var TOOLS_DIR = process.env.AGENTBOARD_TOOLS_DIR || path.join(AGENTBOARD_HOME, 'tools');
var PLATFORM = process.platform;

// ── Utils ──

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

function listDirs(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }).filter(function (e) { return e.isDirectory() && !e.name.startsWith('.'); }).map(function (e) { return e.name; }); } catch (_) { return []; }
}

function winPath(p) {
  var m = p.match(/^\/([a-zA-Z])\//);
  return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
}

function isPortActive(port) {
  try {
    if (PLATFORM === 'win32') {
      var out = child_process.execSync('netstat -ano', { timeout: 3000, encoding: 'utf8', shell: true, windowsHide: true });
      return new RegExp('\\s+TCP\\s+\\S+:' + port + '\\s+.*LISTENING', 'i').test(out);
    }
    return false;
  } catch (_) { return false; }
}

// ── Manifest scanning ──

function scanTools() {
  var seen = {};
  var tools = [];
  if (!fs.existsSync(TOOLS_DIR)) return tools;
  var names = listDirs(TOOLS_DIR);
  names.forEach(function (name) {
    var mfPath = path.join(TOOLS_DIR, name, 'manifest.json');
    var mf;
    try { mf = JSON.parse(read(mfPath)); } catch (_) { return; }
    if (!mf || !mf.name) return;
    seen[name] = true;
    var ports = mf.ports || (mf.port ? [mf.port] : []);
    var running = ports.length > 0 ? ports.every(function (p) { return isPortActive(p); }) : null;
    tools.push({
      name: mf.name, id: name, description: mf.description || '',
      icon: mf.icon || '', version: mf.version || '', category: mf.category,
      order: mf.order, port: mf.port, ports: mf.ports, url: mf.url,
      running: running, startCommand: mf.startCommand, stopCommand: mf.stopCommand,
      projectPath: mf.projectPath, publicUrl: mf.publicUrl, owner: mf.owner || '',
      apiBase: mf.apiBase, type: mf.type || 'service', trigger: mf.trigger || '',
      children: mf.children || [], conflicts: mf.conflicts || [],
      agent_notes: mf.agent_notes || ''
    });
  });
  // Detect port conflicts
  tools.forEach(function (t) {
    var myPorts = t.ports || (t.port ? [t.port] : []);
    tools.forEach(function (other) {
      if (other.id === t.id) return;
      var otherPorts = other.ports || (other.port ? [other.port] : []);
      myPorts.forEach(function (p) {
        if (otherPorts.indexOf(p) !== -1) {
          t.conflicts.push({ toolId: other.id, toolName: other.name, port: p });
        }
      });
    });
  });
  tools.sort(function (a, b) {
    return (a.order != null ? a.order : 99) - (b.order != null ? b.order : 99) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return tools;
}

function findManifest(id) {
  var p = path.join(TOOLS_DIR, id, 'manifest.json');
  if (p && fs.existsSync(p)) return p;
  return null;
}

function startTool(id) {
  var mfPath = findManifest(id);
  if (!mfPath) return { ok: false, error: 'tool not found: ' + id };
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { ok: false, error: 'invalid manifest' }; }
  if (!mf.startCommand) return { ok: false, error: 'no startCommand defined' };

  var myPorts = mf.ports || (mf.port ? [mf.port] : []);
  if (myPorts.length > 0) {
    var allTools = scanTools();
    var conflicts = [];
    allTools.forEach(function (t) {
      if (t.id === id) return;
      if (!t.running) return;
      var tp = t.ports || (t.port ? [t.port] : []);
      myPorts.forEach(function (p) {
        if (tp.indexOf(p) !== -1) conflicts.push(t.name + '(:' + p + ')');
      });
    });
    if (conflicts.length > 0) {
      return { ok: false, error: 'Port conflict: ' + conflicts.join(', ') + ' already using these ports' };
    }
  }

  try {
    var cwd = mf.projectPath ? winPath(mf.projectPath) : AGENTBOARD_HOME;
    var child;
    if (PLATFORM === 'win32') {
      child = child_process.spawn('cmd', ['/c', mf.startCommand], { cwd: cwd, detached: true, stdio: 'ignore', shell: true });
    } else {
      child = child_process.spawn(mf.startCommand, { cwd: cwd, detached: true, stdio: 'ignore', shell: true });
    }
    child.unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function stopTool(id, callback) {
  var mfPath = findManifest(id);
  if (!mfPath) return callback({ ok: false, error: 'tool not found: ' + id });
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return callback({ ok: false, error: 'invalid manifest' }); }
  if (!mf.stopCommand) return callback({ ok: false, error: 'no stopCommand defined' });
  child_process.exec(mf.stopCommand, { timeout: 10000, encoding: 'utf8' }, function (err) {
    if (err) return callback({ ok: false, error: err.message });
    callback({ ok: true });
  });
}

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
        order: { type: 'number', description: '排序权重' }
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
        conflicts: { type: 'array', items: { type: 'string' }, description: '互斥工具 ID 列表' }
      },
      required: ['id']
    }
  }
];

// ── Tool call handlers ──

function handleListTools(args) {
  var tools = scanTools();
  if (args && args.category) {
    tools = tools.filter(function (t) { return t.category === args.category; });
  }
  if (args && args.id) {
    tools = tools.filter(function (t) { return t.id === args.id; });
  }
  var summary = tools.map(function (t) {
    return {
      id: t.id,
      name: t.name,
      category: t.category || '',
      running: t.running,
      port: t.port,
      ports: t.ports,
      description: (t.description || '').substring(0, 300),
      hasStartCommand: !!t.startCommand,
      hasStopCommand: !!t.stopCommand,
      conflicts: t.conflicts,
      agent_notes: t.agent_notes ? t.agent_notes.substring(0, 200) : ''
    };
  });
  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

function handleGetTool(args) {
  if (!args || !args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
  var tools = scanTools();
  var tool = null;
  for (var i = 0; i < tools.length; i++) { if (tools[i].id === args.id) { tool = tools[i]; break; } }
  if (!tool) return { content: [{ type: 'text', text: 'Error: tool not found: ' + args.id }], isError: true };
  var info = {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    icon: tool.icon,
    version: tool.version,
    running: tool.running,
    port: tool.port,
    ports: tool.ports,
    url: tool.url,
    startCommand: tool.startCommand,
    stopCommand: tool.stopCommand,
    projectPath: tool.projectPath,
    publicUrl: tool.publicUrl,
    owner: tool.owner,
    apiBase: tool.apiBase,
    type: tool.type,
    trigger: tool.trigger,
    conflicts: tool.conflicts,
    agent_notes: tool.agent_notes,
    children: tool.children
  };
  return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
}

function handleStartTool(args) {
  if (!args || !args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
  var result = startTool(args.id);
  if (result.ok) {
    return { content: [{ type: 'text', text: 'Started: ' + args.id }] };
  }
  return { content: [{ type: 'text', text: 'Failed to start ' + args.id + ': ' + result.error }], isError: true };
}

function handleStopTool(args) {
  if (!args || !args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
  // stopTool is async, but MCP tools/call is sync — use execSync for stopCommand
  var mfPath = findManifest(args.id);
  if (!mfPath) return { content: [{ type: 'text', text: 'Error: tool not found: ' + args.id }], isError: true };
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { content: [{ type: 'text', text: 'Error: invalid manifest' }], isError: true }; }
  if (!mf.stopCommand) return { content: [{ type: 'text', text: 'Error: no stopCommand defined' }], isError: true };
  try {
    child_process.execSync(mf.stopCommand, { timeout: 10000, encoding: 'utf8', shell: true, windowsHide: true });
    return { content: [{ type: 'text', text: 'Stopped: ' + args.id }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Failed to stop ' + args.id + ': ' + e.message }], isError: true };
  }
}

function handleCreateTool(args) {
  if (!args || !args.id || !args.name) {
    return { content: [{ type: 'text', text: 'Error: id and name are required' }], isError: true };
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(args.id)) {
    return { content: [{ type: 'text', text: 'Error: id must start with a letter, contain only a-z 0-9 - _' }], isError: true };
  }
  var existing = findManifest(args.id);
  if (existing) {
    return { content: [{ type: 'text', text: 'Error: tool already exists: ' + args.id }], isError: true };
  }
  var toolDir = path.join(TOOLS_DIR, args.id);
  var mfPath = path.join(toolDir, 'manifest.json');
  var mf = { name: args.name };
  var knownFields = ['description', 'icon', 'version', 'category', 'order', 'port', 'ports', 'projectPath', 'url', 'startCommand', 'stopCommand', 'publicUrl', 'owner', 'apiBase', 'type', 'trigger', 'agent_notes'];
  knownFields.forEach(function (f) { if (args[f] !== undefined) mf[f] = args[f]; });
  try {
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
    return { content: [{ type: 'text', text: 'Created tool: ' + args.id + ' (' + args.name + ')' }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error creating tool: ' + e.message }], isError: true };
  }
}

function handleUpdateTool(args) {
  if (!args || !args.id) {
    return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
  }
  var mfPath = findManifest(args.id);
  if (!mfPath) {
    return { content: [{ type: 'text', text: 'Error: tool not found: ' + args.id }], isError: true };
  }
  var mf;
  try { mf = JSON.parse(read(mfPath)); } catch (_) { return { content: [{ type: 'text', text: 'Error: invalid manifest' }], isError: true }; }
  // Remove id from args to avoid changing it
  var updates = {};
  var knownFields = ['name', 'description', 'icon', 'version', 'category', 'order', 'port', 'ports', 'projectPath', 'url', 'startCommand', 'stopCommand', 'publicUrl', 'owner', 'apiBase', 'type', 'trigger', 'agent_notes', 'conflicts', 'children'];
  knownFields.forEach(function (f) { if (args[f] !== undefined) updates[f] = args[f]; });
  if (Object.keys(updates).length === 0) {
    return { content: [{ type: 'text', text: 'Error: no known fields to update' }], isError: true };
  }
  for (var k in updates) { mf[k] = updates[k]; }
  try {
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
    return { content: [{ type: 'text', text: 'Updated tool: ' + args.id + '. Changed fields: ' + Object.keys(updates).join(', ') }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error updating tool: ' + e.message }], isError: true };
  }
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

function handleInitialize(id, params) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agentboard', version: '1.0.0' }
    }
  };
}

function handleToolsList(id, params) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: { tools: TOOL_DEFS }
  };
}

function handleToolsCall(id, params) {
  var name = params && params.name;
  var args = params && params.arguments;
  if (!name) {
    return { jsonrpc: '2.0', id: id, error: { code: -32602, message: 'Missing tool name' } };
  }
  var handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Unknown tool: ' + name } };
  }
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
var initialized = false;

rl.on('line', function (line) {
  line = line.trim();
  if (!line) return;

  var msg;
  try { msg = JSON.parse(line); } catch (_) {
    process.stderr.write('[mcp-server] invalid JSON: ' + line + '\n');
    return;
  }

  // Notifications (no id) — don't respond
  if (msg.method && !msg.id) {
    if (msg.method === 'notifications/initialized') {
      initialized = true;
    }
    return;
  }

  // Requests (have id and method)
  if (msg.method && msg.id != null) {
    var handler = METHOD_HANDLERS[msg.method];
    if (!handler) {
      var errResp = JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found: ' + msg.method } });
      process.stdout.write(errResp + '\n');
      return;
    }
    var response = handler(msg.id, msg.params);
    process.stdout.write(JSON.stringify(response) + '\n');
    return;
  }

  // Responses (have id but no method) — ignore
  if (msg.id != null && !msg.method) {
    return;
  }
});

rl.on('close', function () {
  process.exit(0);
});

process.stderr.write('[mcp-server] agentboard MCP server ready (stdio)\n');
