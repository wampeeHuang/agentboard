# HANDOFF · 2026-08-05

## 本次完成
- **MCP 运输层升级：stdio → Streamable HTTP** — 根因是手写 readline+JSON-RPC 缺少生命周期状态机，命令行 pipe 测试能过但 Claude Code/Codex 超时。重写为 `@modelcontextprotocol/sdk` + Streamable HTTP stateless 模式
- **新增 `lib/mcp-handlers.js`** — 共享模块，stdio 和 HTTP 双运输层共用同一套 TOOL_DEFS 和 TOOL_HANDLERS
- **安全门禁** — DNS rebinding 保护显式开启，Host/Origin 校验，只绑 `127.0.0.1`
- **配置更新** — Claude Code (`settings.json`) 和 Codex (`config.toml`) 都切到 `streamableHttp`，stdio 配置注释保留备用
- **验证通过** — curl initialize/tools/list/tools/call 全过，Codex `agentboard_list_tools` 返回 57 工具，Claude Code 无超时警告
- **复盘** — `D:\workspace\_output\retrospectives\2026-08-05-mcp-streamable-http-upgrade.md`
- **新增 tips** — `mcp-sdk-dns-rebinding-not-default.md`、`mcp-handrolled-implementation-fragile.md`、`mcp-stdio-vs-http-transport.md`
- **Git** — `d0dd35f` (SDK 重写)、`7e8094c` (Streamable HTTP)

## 当前状态
- Agentboard :3099 正常运行，`/mcp` POST 端点响应正常
- `mcp-server.js` 保留不删（stdio 备用）
- 工具架 57 工具，全部通过 MCP 可调用

## 仓库状态
- agentboard: 已 commit，未 push
- codex (config.toml): 已 commit (`82f2774`)，未 push
- claude (settings.json): 未纳入 git 管理

## 关键风险
- `@modelcontextprotocol/sdk` npm 包如果升级，需验证 `enableDnsRebindingProtection` 是否改为默认 true（目前 SDK 1.30.0 默认 false）
- `/mcp` 端点在 Express 路由中，如果 agentboard 重启失败，MCP 不可用但 REST API 可能也不可用（同一进程）
