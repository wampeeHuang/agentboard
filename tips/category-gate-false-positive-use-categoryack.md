---
type: method
domain: general
author: claude
date: 2026-09-03
source: Agentboard 审计 — 分类门禁 13 张分类正确卡被 scent 打分误报
---

# 分类门禁误报：加显式 categoryAck 确认布尔，别扩关键词词表

## 现象
- 13 张分类正确的工具卡被分类门禁标 warning
- 触发：描述含底层模型词（模型/LLM/推理/网关/语音），目标分类的 scent 关键词打 0 分 → 判"疑似错分类"

## 根因
`crossValidateCategory` 用关键词气味 + word-boundary 打分。词表窄 + 描述提底层实现词 → 正确分类 0 分、另一个分类 >0 分 → 误报。这是打分器的固有限制：**描述词 ≠ 用户意图分类**。

## 修复/步骤
两个方向对比后选显式确认机制：

1. 扩 scent 词表 → 有把真错分类一起放行的风险（词表永远追不上真实描述分布）
2. manifest 加可选布尔 `categoryAck: true`，门禁开头 `if (mf.categoryAck === true) return []` → 人工/agent 对照 CATEGORY_DEFINITIONS 确认分类正确后勾选，跳过打分打扰

选 2。门禁本义是防错分类，人工确认过的分类不该再被打分器打扰。**误报才勾**；分类真存疑先去查分类定义，别用 ack 掩盖。

## 预防
- 治理门禁的误报处理原则：机制对症（跳过已确认项），不削弱真告警（扩词表 = 两边都放行）
- 加新布尔字段要同步：manifest-schema FIELD_RULES + 表单 checkbox + scanTools 投影（否则编辑表单回填预勾读不到）
- schema 数据/逻辑改动若走热重载，改完直接验 audit，不用重启
