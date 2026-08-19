---
type: diagnosis
date: 2026-07-10
source: Figma MCP 可用性测试，bridge_status 报 plugin.connected=false 但实际操作正常
---

# MCP bridge status 误报：不信任 connected 字段

## 现象
figma-mcp daemon 的 bridge_status 端点固定返回 `plugin.connected: false`。直觉判断"插件未连接"→ 排查配置 → 实际插件已连通且所有操作正常。

## 根因
Daemon v0.0.0 的 WebSocket 连接状态上报未实现（或断连检测逻辑有 bug），connected 字段硬编码为 false。写路径用的连接与状态上报用的连接非同一通道。

## 修复
直接跑轻量写操作验证：`create_text` / `create_rectangle` → 成功=连通。
不依赖 bridge_status 判断可用性。

## 预防
- 任何 MCP bridge 类工具（daemon + plugin 架构），首次或怀疑断连时优先用写操作探测，不信 status 端点
- 工具 manifest 的 agent_notes 已标注此盲区，Agent 操作前读 manifest 即可避免
