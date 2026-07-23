# Agentboard · 工具架

> One manifest.json = one controllable tool. Dashboard for humans, API + MCP for agents.

Agentboard is a local tool control plane. Drop a `manifest.json` in the `tools/` directory and it auto-discovers the tool, detects port status, and provides one-click start/stop. Same registry serves both the browser dashboard and the MCP protocol AI agents use.

![screenshot](screenshot.png)

## What is this?

你机器上跑着十几个本地服务——ComfyUI、Ollama、Stable Diffusion、各种 Web UI。记不住端口号，不知道哪个在跑，想停一个找不到进程。Agentboard 解决这件事。

**一张卡片一个工具。** 每个工具一个 manifest.json 文件，仪表盘自动发现。绿色 = 运行中，灰色 = 已停止。点按钮启动/停止，点链接打开。刷新即更新，不需要重启。

**人也看，AI 也调。** 同一个工具注册表，浏览器里是可视仪表盘，API 和 MCP 协议给 AI agent 调用。人点按钮，AI 调接口——同一份真相，两个平面。

**文件即注册，无数据库。** 在 `tools/` 下建目录、放 manifest.json，工具就上架了。删掉目录就下架。没有中心配置，没有 YAML 编排。

想让你的 AI agent 帮你建一套？往下看。

---

## Quick Start (告诉你的 AI agent 照着做)

### 1. Prerequisites

- **Node.js 18+** — verify: `node --version`
- **Git** — verify: `git --version`
- OS-level port detection works out of the box on all platforms — no extra dependencies

### 2. Clone

```bash
git clone https://github.com/wampeeHuang/agentboard.git ~/.agentboard
```

Windows PowerShell: `~` works. Windows cmd: replace `~` with `%USERPROFILE%`.

If `~/.agentboard` already exists, rename or remove it first — the clone will fail if the target directory is non-empty.

### 3. Install

```bash
cd ~/.agentboard
npm install
```

Only one dependency: `express`. Installs in seconds.

### 4. Start

```bash
node server.js
```

Expected output: `Agentboard http://localhost:3099`

**Verify**: `curl http://localhost:3099/api/tools` returns JSON. If port 3099 is in use, set `PORT=3098 node server.js`.

The dashboard opens at `http://localhost:3099` with an empty tool rack. See `examples/` for manifest templates — copy one to `tools/` and customize.

### 5. Register your first tool

Copy an example and customize, or create from scratch:

```bash
cp -r examples/hello-server tools/my-server
# edit tools/my-server/manifest.json with your paths and ports
```

Or create a directory and manifest manually:

```
~/.agentboard/tools/my-server/
└── manifest.json
```

**Minimum viable manifest:**

```json
{
  "name": "My Server",
  "description": "A demo HTTP server",
  "capability": "Demo server",
  "owner": "自建",
  "icon": "🚀",
  "version": "1.0.0",
  "category": "设施",
  "port": 3456,
  "url": "http://localhost:3456",
  "projectPath": "/home/me/my-project",
  "startCommand": "cd /home/me/my-project && python server.py",
  "stopCommand": "npx kill-port 3456"
}
```

**Platform-specific `startCommand`:**

| Platform | Example |
|----------|---------|
| macOS / Linux | `cd /home/me/project && python server.py` |
| Windows (cmd) | `cd /d C:\Users\me\project && python server.py` |
| Windows cross-platform | `node C:/Users/me/project/server.js` (forward slashes work in Node) |

`stopCommand`: `npx kill-port <port>` works on all platforms. Requires internet on first run (to download the `kill-port` package). For offline, use platform-specific killers: `taskkill /F /IM python.exe` (Windows) or `pkill -f "python server.py"` (Linux/Mac).

**No restart needed.** The dashboard picks up new manifests on every page load / API request. `curl http://localhost:3099/api/tools` shows the new tool immediately.

### 6. (Optional) Keep it running

Agentboard stops when you close the terminal. To keep it alive:

| Platform | Method |
|----------|--------|
| Windows | Task Scheduler or `Start-Process -WindowStyle Hidden node server.js` |
| macOS | `launchctl` or `pm2 start server.js` |
| Linux | `systemd --user` or `pm2` |

---

## Dual-plane Architecture

| Plane | Protocol | Entry | Consumer |
|-------|----------|-------|----------|
| **Human** | REST HTTP | `http://localhost:3099` | Browser dashboard |
| **AI Agent** | MCP JSON-RPC stdio | `mcp-server.js` | Claude Code, Cursor, Windsurf, etc. |

Both planes share one truth source: `tools/{id}/manifest.json`. Change a file, both planes see it instantly.

```
~/.agentboard/
├── server.js              ← REST API + Dashboard (humans)
├── mcp-server.js          ← MCP JSON-RPC stdio (AI agents)
├── index.html             ← Dashboard frontend (zero-framework HTML/CSS/JS)
├── lib/
│   ├── tool-registry.js   ← Core logic (shared by both planes)
│   ├── manifest-schema.js ← Manifest validation
│   ├── ops-log.js         ← Operational event log
│   └── crash-guard.js     ← Crash protection for spawned Node tools
├── examples/              ← Manifest templates (committed — copy to tools/)
│   ├── hello-server/
│   └── nextjs-app/
├── tools/                 ← Your tool registry (gitignored — personal)
│   └── your-tool/
│       └── manifest.json
├── runtime/               ← Process identity files (PID tracking)
├── tips/                  ← Operational tips (optional)
└── _runtime/              ← Runtime data (event logs, sort state)
```

---

## MCP: Connecting AI Agents

After agentboard is running, tell your AI agent how to find it:

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "node",
      "args": ["~/.agentboard/mcp-server.js"]
    }
  }
}
```

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "node",
      "args": ["C:\\Users\\你的用户名\\.agentboard\\mcp-server.js"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agentboard": {
      "command": "node",
      "args": ["~/.agentboard/mcp-server.js"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`) — same format as Cursor.

Restart your editor after adding the config. The agent gains 6 tools:

| MCP Tool | What it does |
|----------|-------------|
| `agentboard_list_tools` | List all tools with running status, ports, conflicts |
| `agentboard_get_tool` | Get one tool's full details (conflicts, agent_notes) |
| `agentboard_start_tool` | Start a tool (checks port conflicts first) |
| `agentboard_stop_tool` | Stop a tool |
| `agentboard_create_tool` | Register a new tool (writes manifest with schema validation) |
| `agentboard_update_tool` | Update an existing tool's manifest fields |

**Agent workflow** — the agent should follow this sequence every time:

```
1. agentboard_list_tools → find target tool
2. Read conflicts → any running conflict? Stop it first or pick alternative
3. Read agent_notes → known pitfalls? Check before acting
4. tool is stopped → agentboard_start_tool
5. tool is running → call the tool directly
```

---

## Manifest Reference

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `description` | string | Tool description. Recommended format: 【用途】【何时用】【何时不用】【返回】 |
| `capability` | string | One-line task description (≤30 chars). Agents use this to decide which tool fits the task |
| `owner` | string | `自建` (self-hosted) / `外部` (external service) / `AI托管` (AI-managed) |

### All fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | — | Display name. `id` is auto-derived from the directory name |
| `description` | string | — | Tool description |
| `capability` | string | — | One-line task description (≤30 chars) |
| `owner` | string | — | 自建 / 外部 / AI托管 |
| `icon` | string | `""` | Emoji icon |
| `version` | string | `""` | Version number |
| `category` | string | `""` | 模型 / Agent / 设施 / 获取 / 查阅 / 创作 / 职能 |
| `order` | number | `0` | Sort weight (lower = first) |
| `port` | number | — | Primary port |
| `ports` | number[] | — | Multiple ports (use instead of `port`) |
| `url` | string | — | Runtime URL |
| `projectPath` | string | — | Working directory for startCommand |
| `startCommand` | string | — | Shell command to start the tool |
| `stopCommand` | string | — | Shell command to stop the tool |
| `preStart` | string | — | Cleanup command run BEFORE each start (clear lock files, kill stale ports). Failures don't block startup |
| `type` | string | `"service"` | service / cli / folder / group / script |
| `conflicts` | string[] | `[]` | Tool IDs that can't run simultaneously. Manifest declares IDs — runtime auto-enriches with port conflict objects and displays them in the dashboard |
| `agent_notes` | string | `""` | Pitfall notes for AI agents. Written in natural language — the agent reads before acting |
| `trigger` | string | `""` | Trigger command (script type) |
| `children` | string[] | `[]` | Child tool IDs (group type) |
| `publicUrl` | string | — | Public-facing URL if deployed |
| `apiBase` | string | — | API base URL for model-type tools |
| `dashboard` | object | — | Embedded dashboard config |
| `disabled` | boolean | `false` | Disabled tools show dimmed, excluded from start/conflict detection |
| `runtime` | object | — | `{language, version, manager, note}` — runtime environment metadata |

### Virtual tools (link-only cards)

Omit `port` and `startCommand`. Fill `name`, `url`, `owner`, `capability`, `description`. The card becomes a clickable link — no process management.

---

## API

Base: `http://localhost:3099`

### Tool management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api` | API discovery (all endpoints + manifest schema) |
| `GET` | `/api/tools` | List all tools with live running status |
| `GET` | `/api/tools/:id` | Single tool detail |
| `POST` | `/api/tools/start/:id` | Start a tool |
| `POST` | `/api/tools/stop/:id` | Stop a tool |
| `POST` | `/api/tools` | Create a tool `{id, name, port, ...}` |
| `PUT` | `/api/tools/:id` | Update a tool |
| `POST` | `/api/tools/reorder` | Reorder `{items: [{id, order}]}` |

### Health & stats

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health report (crashes, abnormal exits, uptime) |
| `GET` | `/api/stats` | API call stats (by caller/operation/tool) |

### Agent usage examples

```bash
# List all tools
curl http://localhost:3099/api/tools

# Start a tool
curl -X POST http://localhost:3099/api/tools/start/my-server

# Stop a tool
curl -X POST http://localhost:3099/api/tools/stop/my-server

# Verify startup (wait a few seconds for port to come up)
curl -s http://localhost:3099/api/tools | node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var t=JSON.parse(d);var m=t.tools.find(function(x){return x.id==='my-server'});console.log(m?m.running:'not found')})"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3099` | Dashboard port. Fails loudly if occupied — no silent fallback |
| `AGENTBOARD_HOME` | `~/.agentboard` | Data root directory |
| `AGENTBOARD_TOOLS_DIR` | `~/.agentboard/tools` | Where manifest directories are scanned |

---

## Platform Support

| Platform | Port detection | Process launcher |
|----------|---------------|-----------------|
| Windows | `netstat -ano` | `cmd /c` |
| macOS | `lsof -i` | `sh -c` |
| Linux | `ss -tlnp` | `sh -c` |

Same codebase, all three platforms, zero native dependencies.

---

## Design Principles

- **Filesystem as registry** — No database. No YAML orchestrator. No schema migrations. Add file = register. Delete file = unregister.
- **OS-level truth** — Port status comes from the OS network stack, not HTTP ping. (Pingable ≠ healthy. Timeout ≠ port not listening.)
- **Shared core logic** — `lib/tool-registry.js` is the one source of truth. `server.js` (REST) and `mcp-server.js` (MCP) are thin protocol adapters.
- **Agent-first** — All operations are HTTP calls. No SDK, no new tools to learn.
- **Fixed port** — Dashboard is always `:3099`. Port conflicts fail loudly — discoverability beats fault tolerance.

## Security

Agentboard is designed for **localhost only**. No auth, no TLS, no user isolation. The trust boundary is the filesystem — anyone who can write to `~/.agentboard/tools/` can already execute arbitrary shell commands. **Do not expose to the network.** Do not bind to `0.0.0.0`.

## License

MIT
