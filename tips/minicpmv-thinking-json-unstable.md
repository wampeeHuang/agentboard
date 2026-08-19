---
type: diagnosis
date: 2026-07-15
source: O1 纪录片管线 Phase 03 MiniCPM-V F1-F4 初筛
---

# MiniCPM-V Q4_K_M thinking 变体 JSON 输出不稳定

## 现象

MiniCPM-V Q4_K_M（thinking 变体）对图片 + JSON prompt 返回空响应或截断文本，即使 prompt 明确要求 "Answer ONLY valid JSON"。

## 根因

thinking 变体在 `content` 之前先输出 `reasoning_content`（内部推理 token）。`max_tokens` 限制的是 reasoning + content 的总 token 数。当 `max_tokens` 设得太低（如 400），推理阶段吃掉全部配额，JSON 还没开始写就被截断。

## 修复

- `max_tokens` 至少 800（图片 + JSON 场景），推荐 1200
- `temperature` 设 0.1（降低推理发散度）
- 业务侧加兜底：解析失败时正则提取关键字段，再失败搜索 PASS/CAUTION/FAIL 关键词

## 预防

- 首次用 thinking 变体前，用 2-3 条样本测试不同 max_tokens 值（400/800/1200），确认哪个值开始稳定返回完整 JSON
- 不在全量 80+ 条上直接跑未校准的 prompt + max_tokens 组合
