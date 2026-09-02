---
type: method
domain: general
author: claude
date: 2026-09-02
source: 灵感墙 URL 采集自动打标签，deepseek-v4-flash 返回空标签
---

# 结构化输出（打标签/JSON/分类）用非思考模型 deepseek-chat，不用 reasoning 的 deepseek-v4-flash

## 现象
灵感墙自动打标签调 DeepSeek `/chat/completions`，模型 `deepseek-v4-flash`、`max_tokens=40`。HTTP 200、无异常，但 `choices[0].message.content` 为空、`finish_reason=length`，打标签结果恒为空列表——不报错、静默产出空。

## 根因
DeepSeek 文本模型分两类：
- **思考型**（`deepseek-v4-flash`）：先写 `reasoning_content`，再写 `content`。`max_tokens` 小时预算全烧在思考上，`content` 空手而归。
- **非思考型**（`deepseek-chat`）：直接写 `content`，`finish_reason=stop`。

结构化输出（打标签、抽 JSON、分类）不需要推理链，思考型是错工具——又慢又烧预算还产出空。

## 修复/步骤
1. 结构化输出任务 → 模型直接选 `deepseek-chat`（非思考型），一次到位。
2. 真需要推理链（复杂推理、多步分析）才用 `deepseek-v4-flash`，`max_tokens` 给足，读结果时 `content` 与 `reasoning_content` 双字段兜底。
3. 拿到空结果先别查密钥/网络——先看 `finish_reason` 是不是 `length`（= 预算被思考吃光）。

## 预防
- 写任何"让模型吐固定格式结果"的调用前，先问一句：这任务要推理吗？不要 → 非思考模型。
- 同源诊断见 `deepseek-vision-reasoning-content-empty.md`（vision 版 + 密集图 reasoning 螺旋）。
