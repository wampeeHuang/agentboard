---
type: method
date: 2026-07-29
source: layout-gallery growth-agent, AIGO API 集成
---

# 第三方 API Key 环境变量名先验证再写代码

## 现象
growth-agent.js 用 `process.env.AIGO_API_KEY` 读 AIGO API Key，但实际系统环境变量是 `AIGOAPI_API_KEY`。代码写完 API 调用静默失败 "API Key 未配置"。

## 根因
按自然语言推测变量名（"AIGO 的 API Key"→ AIGO_API_KEY），没先查实际环境或凭证库（飞书 Base）。

## 修复
改为三路回退：`AIGOAPI_API_KEY || AIGOAPI_KEY || AIGO_API_KEY`

## 预防
- 写 API 调用代码前，先用 `ls env:` (PowerShell) 或查凭证表（飞书 Base / .env 文件）确认变量名
- 不要按"厂商名 + _API_KEY"模式猜名字。AIGO = AIGOAPI、DeepSeek = DEEPSEEK、Coze = COZE — 各厂商命名不一致
- 多路回退是兜底不是替代 — 先确认正确名字，再加回退
