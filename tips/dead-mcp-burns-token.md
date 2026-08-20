---
type: diagnosis
date: 2026-08-20
source: DeepSeek 成本优化 — 审计 MCP token 拖累
---

# 死 MCP 服务不跑，但工具定义照烧 token

## 现象

Claude Code 每次会话 token 巨大，审计发现 9 个 MCP 全量注册。其中 openclaw-control 暴露 ~100 个工具定义，但从未成功调用过。

## 根因

MCP 服务没跑（网关 127.0.0.1:18789 拒绝连接），但 Claude Code 不管服务在线否，工具定义照常注入 context。每个工具定义几十到几百 token，100 个 = 几万 token 固定开销，每次会话都烧。DeepSeek 缓存命中 0.05元/M vs 未命中 1.5元/M（30 倍差），死 MCP 的 prefix 全价重算。

## 修复

1. 调 MCP 的 health/status 工具，看 `lastSuccessAtMs`（null = 从未连上）
2. `netstat -ano | grep <port>` 确认端口没监听
3. `.claude.json` 移除该 mcpServer 条目
4. `python -c "import json; json.load(open('.claude.json'))"` 验证 JSON 合法

## 预防

- 加新 MCP 后调一次 health，确认 lastSuccessAtMs 非 null
- 定期审计 MCP 清单：不用的场景断，需要时 `claude mcp add` 30 秒加回
- 死 MCP 特征：网关/服务停掉后，工具定义仍注入但调用全失败
