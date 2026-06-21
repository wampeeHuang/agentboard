# MCP 修复根因后不会自动恢复——需重启 Session
type: diagnosis
date: 2026-06-16
source: codex-relay 挂了导致 codex_apps MCP 启动失败，修好 relay 后 MCP 仍不可用

## 现象
- MCP server 因依赖服务挂了（如 codex-relay 未启动）导致 session 启动时加载失败
- 修好依赖服务后，MCP 仍显示 `failed`
- 当前 session 内看不到该 MCP 的工具

## 根因
MCP servers 只在 Claude Code session 启动时加载一次。没有自动重试机制。中间依赖恢复后，当前 session 不会感知到。

## 修复
两种方式：
1. **重开 Claude Code** —— 新 session 会重新加载所有 MCP
2. **`/mcp` 命令** —— 在 session 内重新加载 MCP 配置（如果支持）

修依赖 ≠ MCP 恢复。关键检查顺序：先确认依赖服务正常 → 再重开 session 或 `/mcp`。

## 预防
- Session 启动时看到 `⚠ MCP startup incomplete` → 先修根因，再重开 session
- 不要在已损坏的 session 里继续工作——MCP 工具不会中途恢复
