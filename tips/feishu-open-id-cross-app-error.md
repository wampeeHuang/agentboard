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

## 与 Vercel 表单集成时的补充门禁（2026-09-29）

当一个线上表单需要“写入飞书 Base + 私信负责人 + 群通知”时，不要因为同一个机器人能访问 Base 或能在群里说话，就推断它也能私信某个既有 `open_id`。这三项权限可能来自不同应用：

1. 先分别探针：Base 读/写、个人私信、群消息；
2. `open_id` 必须使用与通知机器人相同应用下的身份；若联系人登记显示 `via` 属于另一 Bot，就用该 Bot 的凭证发私信；
3. Base 写入身份与通知身份允许分离，但必须在运行时明确区分两组环境变量，不能混用；
4. 记录一个不含客户资料的验收询盘，只有 Base 的“通知状态”已回写为“已通知”时，才认定个人和群两条消息都成功。

这条门禁不要求在日志中保存 App ID、Open ID、Chat ID 或密钥；记录机器人角色、通道类型和最终状态即可。
