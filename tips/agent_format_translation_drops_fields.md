# Agent 跨格式搬运必定丢字段

type: tip
date: 2026-07-09
source: 深圳职位巡检 cron — 飞书卡片两次丢失 URL

## 现象
Agent 产出 MD 表格（含链接）→ Agent 手工改写为飞书卡片 JSON → URL 列全部消失。两次巡检同样问题，用户无法跳转。

## 根因
Agent 不是编译器。从格式 A（MD 表格）到格式 B（飞书卡片 lark_md）的搬运过程，Agent 做"压缩 + 转格式"两步认知操作，字段丢失是必然的——不是某一个 Agent 不行，是这个操作类型不该让 Agent 做。

## 修复
拆两端。语义工作（搜索+判断+写结构化 JSON）归 Agent。机械工作（JSON → 卡片 / JSON → MD / 校验）归脚本。

关键设计：
- 结构化 JSON 定义 schema，`url` 字段必填且非空
- `gen_card.py` 读 JSON → 机械生成卡片，URL 字段空 → `exit 1`
- Agent 不再手写任何 display artifact（卡片/MD），全由脚本生成

## 预防
任何跨格式数据搬运：Agent 产出结构化数据（JSON），脚本负责 format-to-format translation。不让 Agent 同时做"压缩语义 + 改写格式"两步。
