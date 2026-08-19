---
type: diagnosis
date: 2026-07-22
source: Supervisor 飞书告警推送返回 `99992361 open_id cross app`
---

# 飞书 open_id cross app 错误 — 用错 Bot 发消息

## 现象

调用飞书 `POST /open-apis/im/v1/messages`，返回错误码 `99992361`，提示 `open_id cross app`。

## 根因

飞书的 `open_id` 是 **per-app 的**。用户 A 在 Bot X 下的 open_id，与在 Bot Y 下的 open_id 不同。

多 Bot 架构中，联系人（contact）归属于特定 Bot。用错误的 Bot 凭证去发消息给不属于它的 open_id → `cross app` 错误。

```javascript
// 错误：用 BOTS[0] 发消息，但 contact 属于 BOTS[1]
await sendDirect(accountOfBot0, 'open_id', contact.openId, text);

// 正确：按 contact.via 找到对应的 Bot
const bot = BOTS.find(b => b.id === contact.via) || BOTS[0];
```

## 修复/步骤

1. `CONTACTS` 数组中每条联系人加 `via` 字段，指向所属 `BOTS[].id`
2. `sendAlert()` 按 `contact.via` 匹配正确 Bot，再取凭证发消息
3. 加兜底：找不到对应 Bot 时报明确错误，不静默用第一个 Bot

## 预防

飞书多 Bot 架构：联系人必须绑定到具体 Bot。发消息前按 `via` 字段路由到正确 Bot 取 token，不要假设所有 open_id 在任一 Bot 下都有效。
