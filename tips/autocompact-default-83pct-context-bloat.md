---
type: diagnosis
date: 2026-08-20
source: DeepSeek 成本优化 — 长会话 token 滚雪球
---

# autoCompact 默认 83% 才触发，长会话 token 滚雪球主因

## 现象

重度用户日耗 1.93亿 token（正常 4-6 倍），平均每次 API 请求 9.1万 token，context 长期在高位运行。

## 根因

Claude Code 默认 auto-compact 在 context 到 ~83%（约 83万 token）才触发。长会话不 compact，每轮请求把全部历史重发给模型，token 滚雪球。compact 本身按全价计费（专用 prompt），攒越多越贵。

## 修复

settings.json 顶层加 `"autoCompactWindow": 200000`（范围 100000-1000000，默认 unset=模型调优窗口）。context 上限从 83万砍到 20万，缓存命中率飙升。等价方式：`/autocompact` 命令、`CLAUDE_CODE_AUTO_COMPACT_WINDOW` 环境变量、`DISABLE_AUTO_COMPACT` 禁用。

## 预防

- 任务节点 `/compact 保留XX`，不按时钟；越早越省（全价内容少）
- 切不相关任务 `/clear`（免费，不生成摘要）
- 丢整段方向 `/rewind`（回退缓存位置，比重建便宜）
- 会话中别改 CLAUDE.md / 切模型（缓存全失效，全价重算）
