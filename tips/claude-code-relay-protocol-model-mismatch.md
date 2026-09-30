---
type: diagnosis
date: 2026-09-22
domain: general
author: codex
source: 2026-09-22 洛水外置 API 排障中，CC Switch 接入 AI 算力中转站的 Claude Code 实测
---

# 中转网页能调用但 Claude Code 报 403 时，要核对协议转换与模型映射

## 现象

中转站控制台或小型直连接口请求可返回内容，Claude Code 却报 `403 Insufficient account balance` 或 `403 Request not allowed`；仅看账户余额、Key 测通或界面显示的模型名称，无法判断 Claude Code 实际请求走了哪个上游与协议。某模型 ID 的可用性也可能变化。

## 根因

本次检查发现，CC Switch 当前 Claude 提供者的上游仍指向原生 `https://api.anthropic.com/v1/messages`，而非已验证的中转站；`.claude/settings.json` 指向本地代理，但默认 Haiku/Sonnet/Opus 模型角色仍是原生 ID。中转站的轻量 `/v1/messages` 和 `/v1/chat/completions` 直连均曾返回 200，但 Claude Code 原生 Messages 请求仍遭 `403 Request not allowed`。这说明“Key 可用”和“该客户端的完整请求可用”是两项不同验证；服务端为何拒绝原生 CLI 请求、早期余额报错的内部计费原因均未证实，不能擅自归因。

## 修复/步骤

1. 备份当前 CC Switch 提供者数据库与 `.claude/settings.json`，只在私有恢复点保留凭证，不将 Key 放进经验日志。
2. 读取当前生效提供者、代理地址、上游 Base URL、`apiFormat` 和全部模型角色映射；不要仅看 CC Switch 页面选择项或 `.claude/settings.json` 的单一字段。
3. 对中转站当前实际开放的模型 ID 分别做极小的直连请求，区分 `/v1/messages`、`/v1/chat/completions` 与实际客户端请求；确认可用协议后，让 CC Switch 上游指向中转站，并使用实测可用的 `openai_chat` 转换，所有默认模型角色映射到实测可用 ID。本次 `claude-fable-5-特价` 在当日小测可用，不能视作长期固定 ID。
4. 关闭旧 Claude 会话后，用正常 CLI 最小文本请求验收，再单独测试一次工具调用；分别检查 CLI 结果与代理请求状态。设置很低的 `--max-budget-usd` 可能造成独立的预算终止，不要误判成 403。

## 预防

模型 ID、Key 所属套餐、模型角色映射、上游地址和协议格式作为一组配置核验；出错时记录 HTTP 状态与请求路径，但不记录密钥。单次短文本成功不等于长上下文、技能调用或多 Agent 稳定：本次正常 CLI 短文本成功，`--bare` 的轻量 Read 成功；正常模式的 Read 曾触及人为预算上限，代理日志亦出现间歇性 502，仍须用目标工作流渐进验证。
