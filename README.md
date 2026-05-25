# Agentboard · 智驭台

**Filesystem-as-registry toolchain control plane for AI agents.**

Not another homelab dashboard. No YAML config file. Tools register by dropping a `manifest.json` into a directory. The dashboard auto-discovers them, checks port status at OS level, and provides one-click start/stop — for both humans and AI agents.

![screenshot](screenshot.png)

```
~/.claude/tools/
├── langgraph-rag/
│   └── manifest.json    →  appears in dashboard automatically
├── comfyui/
│   └── manifest.json
└── your-tool/
    └── manifest.json
```

## Why this exists

Existing dashboards (Dashy, Heimdall, Homer, Homarr) are built for **humans** to configure manually. Agentboard is built for **AI agents** — an agent can `Write` a manifest.json, `exec` a startCommand, and `curl /api/tools` to verify status. The filesystem IS the registry.

| | Dashy/Heimdall/Homer | Agentboard |
|---|---|---|
| Config | YAML file, human-edited | manifest.json per tool, agent-writable |
| Discovery | Manual config | Auto-scanned from directory |
| Status check | HTTP ping | OS-level `netstat`/`lsof`/`ss` |
| Start/Stop | Not built in | Shell commands from manifest |
| Agent API | None | REST API with schema discovery |
| For AI agents | No | Yes — designed for it |

## Quick start

```bash
git clone <repo-url> agentboard
cd agentboard
npm install
npm start
# → http://localhost:3099
```

**Requirements**: Node.js 18+, `netstat` (Windows) / `lsof` (macOS) / `ss` (Linux) available in PATH.

## Register a tool

Create a directory and manifest:

```bash
mkdir -p ~/.claude/tools/my-tool
```

```json
{
  "name": "My Tool",
  "description": "What it does",
  "icon": "🔧",
  "version": "1.0.0",
  "category": "AI 模型",
  "order": 10,
  "port": 8080,
  "projectPath": "/path/to/project",
  "url": "http://localhost:8080",
  "startCommand": "cd /path/to/project && python app.py",
  "stopCommand": "npx kill-port 8080"
}
```

Refresh the dashboard — the tool appears with live port status.

### Manifest schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name. `id` is auto-derived from the directory name. |
| `description` | string | No | One-line description |
| `icon` | string | No | Emoji or single character |
| `version` | string | No | Semver |
| `category` | string | No | `基础设施` / `内容` / `开发` / `AIGC` / `AI 模型` / `其他` (default) |
| `order` | number | No | Sort order (default 99, lower = first) |
| `port` | number | No | Single port for status check |
| `ports` | number[] | No | Multiple ports (use instead of `port`) |
| `projectPath` | string | No | Working directory for `startCommand` |
| `url` | string | No | Browser URL when running |
| `startCommand` | string | No | Shell command to start |
| `stopCommand` | string | No | Shell command to stop |

**Virtual tools**: Omit `port`/`startCommand`/`stopCommand`, provide only `url`. No status check — always shows "open" button.

## API

Base: `http://localhost:3099`

### GET /api

Agent discovery endpoint. Returns available endpoints, manifest schema, and configured directories.

```json
{
  "name": "Agentboard",
  "version": "1.0.0",
  "description": "Filesystem-as-registry toolchain control plane for AI agents",
  "endpoints": {
    "GET /api": "This discovery document",
    "GET /api/tools": "List all registered tools with running status",
    "POST /api/tools/start/:id": "Start a tool by id",
    "POST /api/tools/stop/:id": "Stop a tool by id",
    "POST /api/tools/reorder": "Reorder tools"
  },
  "manifestSchema": { ... },
  "toolsDir": "/home/user/.claude/tools"
}
```

AI agents should call `GET /api` first to discover the API surface and schema.

### GET /api/tools

Returns all registered tools with live running status.

```json
{
  "ok": true,
  "tools": [
    {
      "id": "langgraph-rag",
      "name": "LangGraph RAG 问答",
      "description": "RAG QA system — DeepSeek + ChromaDB",
      "icon": "🧠",
      "version": "1.0.0",
      "category": "AI 模型",
      "order": 6,
      "port": 8766,
      "url": "http://localhost:8766/ask",
      "running": true,
      "ports": [8766]
    }
  ]
}
```

### POST /api/tools/start/:id

Starts a tool. Returns `{ ok: true }` or `{ ok: false, error: "..." }`.

The server spawns the `startCommand` as a detached child process. It does not wait for the process to be ready — poll `GET /api/tools` to confirm the port is listening.

### POST /api/tools/stop/:id

Stops a tool by running its `stopCommand`. Returns `{ ok: true }` or `{ ok: false, error: "..." }`.

### POST /api/tools/reorder

Persists tool sort order.

```json
{
  "items": [
    { "id": "agentboard", "order": 0 },
    { "id": "comfyui", "order": 1 }
  ]
}
```

## How AI agents use it

Agentboard is designed so an AI agent can manage the entire toolchain without human intervention:

1. **Register a tool**: `Write ~/.claude/tools/{id}/manifest.json`
2. **Discover tools**: `curl http://localhost:3099/api/tools`
3. **Check if running**: read `running` field from `/api/tools`
4. **Start**: `curl -X POST http://localhost:3099/api/tools/start/{id}`
5. **Verify**: poll `/api/tools` until `running: true`
6. **Stop**: `curl -X POST http://localhost:3099/api/tools/stop/{id}`

No database migration. No config file merge conflicts. The filesystem is the source of truth.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3099` | Dashboard port (fixed, fails if occupied) |
| `AGENTBOARD_TOOLS_DIR` | `~/.claude/tools` | Tool manifest directory |
| `AGENTBOARD_SKILLS_DIR` | `~/.claude/skills` | Skill diagram directory (optional) |

## Cross-platform

| Platform | Port check | Process spawn |
|---|---|---|
| Windows | `netstat -ano` | `cmd /c <command>` |
| macOS | `lsof -i` | `sh -c <command>` |
| Linux | `ss -tlnp` | `sh -c <command>` |

## Design principles

- **Filesystem as registry** — no database, no config file, no schema migration
- **OS-level truth** — port status from `netstat`/`lsof`/`ss`, not HTTP ping
- **Agent-native** — every operation accessible via REST API with schema discovery at `/api`
- **Fixed port** — dashboard always at `:3099`, fails fast if occupied (discoverability > convenience)

## Security

Agentboard is designed for **localhost use**. It has no authentication, no TLS, and executes shell commands from manifest files. Keep it on `127.0.0.1` — do not expose it to the network. Tools are registered via filesystem access, which is the implicit trust boundary: if an agent can write to `~/.claude/tools/`, it can already run arbitrary commands.

## License

MIT
