---
type: diagnosis
domain: general
author: claude
date: 2026-09-01
source: obs-shaderpicker dock 面板探针直连真实 OBS，按协议文档组装认证字段被 4009 拒绝
---

# obs-websocket v5 认证字段按协议文档组装会 4009，信服务端源码

## 现象

直连 OBS obs-websocket 5.x，按协议文档构造 Identify 的 `authentication` 字段：
`base64(challenge+salt+auth)`，服务端直接关闭连接，close code **4009**（AuthenticationFailed）。

## 根因

obs-websocket v5 服务端校验逻辑（WebSocketServer_Protocol.cpp 的
CheckAuthenticationString）是：`authentication` 字段必须等于
`base64(sha256(secret + challenge))`，其中 `secret = base64(sha256(password + salt))`。
协议文档里"authentication = base64(challenge+salt+auth)"的写法是**错的**
（文档还让 `auth` 变量和 `authentication` 字段同名，极易混）。

## 修复/步骤

```js
// b64sha(s) = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))))
const h1 = await b64sha(password + salt);            // secret
const auth = await b64sha(h1 + challenge);            // 直接拼接，别再包 base64(challenge+salt+auth)
ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: auth } }));
```

握手顺序：先等服务端发 **op0 Hello**（拿到 salt + challenge），收到后才发 op1 Identify；
不要在 socket open 事件上就直接发 Identify。

## 预防

- 认证/协议类问题，文档和实现冲突时以**服务端源码**为准，先读源码再对文档
- 4009 = AuthenticationFailed，第一时间查认证字段组装方式，不是查密码
- 已在 obs-shaderpicker 的 `_runtime/probe_scene_order.js` 落地正确写法，可直接参考
