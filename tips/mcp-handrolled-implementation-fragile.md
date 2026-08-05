# 手写 MCP 是伪需求 — 命令行能过≠客户端能过
type: diagnosis
date: 2026-08-05
source: agentboard 手写 readline+JSON-RPC MCP 在 Claude Code/Codex 中超时，命令行 pipe 测试全过

## 现象
手写 `readline` + JSON-RPC 的 MCP stdio server：
- `echo '{"jsonrpc":"2.0"...}' | node mcp-server.js` → 命令行测试全过
- Claude Code / Codex 启动 → 30 秒超时、120 秒还是超时
- 无报错，stdout 干净，stderr 无异常

## 根因
MCP 协议看起来简单（newline-delimited JSON），但真正的 MCP 客户端对协议时序、消息帧、生命周期有严格要求：

1. **无生命周期状态机** — 缺少 `initialize → initialized → operate` 三阶段。客户端发 initialize 后等 `notifications/initialized` 通知，手写版直接返回 response，跳过了通知
2. **依赖 Node.js `readline` 默认行为** — readline 按行分割，但 MCP 消息帧要求显式处理 `\r\n` vs `\n`、缓冲区边界、分片消息
3. **无 ping/keepalive** — 客户端定期发 ping 验证服务端存活，无响应 = 杀进程。手写版不认识 ping 方法，超时被 kill

## 修复
直接用 `@modelcontextprotocol/sdk`，不手写协议层。

## 预防
- MCP 不手写。协议复杂度不在消息格式，在生命周期和时序。SDK 已覆盖所有坑
- 命令行 pipe 测试不是有效验证。必须用真实 MCP 客户端（Claude Code / Codex）验证
