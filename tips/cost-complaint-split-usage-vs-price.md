---
type: method
date: 2026-08-20
source: DeepSeek 成本优化 — 用户报"一天100块太贵"
---

# 成本投诉先分"用量"还是"单价"，再对症

## 现象

用户报"API 一天 100 块太贵"，直觉是"换便宜的平台"。

## 为什么

"贵"是单价问题，"100块/天"是单价×用量。两个根因对应不同解法：
- 单价贵 → 换模型（pro→flash 降 3 倍）、比价（智谱按量 $4.4/M 比 DeepSeek flash 4.5元/M 贵 7 倍）
- 用量失控 → 砍 token 生成（effort 降、断死 MCP、autoCompact、thinking 关）

## 实施

1. 先算两个数：日均 token、单价（= 日耗 ÷ 日均 token）
2. 单价 > 行业基准（DeepSeek flash 输出 4.5-9元/M）→ 查模型档位、比价
3. 单价正常但量巨大（>5000万 token/天）→ 查 token 生成源：thinking token 占比、context 滚雪球、MCP 拖累

## 反例

用户 1.93亿 token/天，单价 0.52元/M（已便宜）。若直接换智谱订阅，Lite 额度只够 1.8 天，且智谱按量 API 贵 7 倍——诊断错方向，方案全废。
