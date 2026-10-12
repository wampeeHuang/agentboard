---
type: method
domain: general
author: 其他
date: 2026-10-03
source: Obsidian 点 Connect 完全不唤起浏览器，取插件自存 state 手工拼授权地址绕过
---

# 宿主唤不起浏览器时，用插件自存的 state 手工拼 OAuth 地址绕过

## 现象

Obsidian 插件（Air Sync）点 `Connect` 毫无反应。查 Chrome / Edge / 夸克三个浏览器历史库，
**没有任何一次授权地址被打开**（`takezo` / `airsync` / 内置 client_id 全部命中 0）⇒ 宿主调
`openExternal` 失败。而用户自己在浏览器里访问 Google 一切正常 ⇒ 坏的只有"程序唤起浏览器"这一环。

## 根因

宿主走 Electron `shell.openExternal` → 系统默认浏览器关联，链路任一环坏掉都是静默失败。
注意：Google / OneDrive / Dropbox **三种后端都要浏览器 OAuth** ⇒ 此时换后端毫无意义。

## 步骤

1. 读插件持久化的授权态，拿到它准备发给 IdP 的 `state`：
   `<vault>/.obsidian/plugins/<plugin>/data.json` → `backendData.pendingAuthState`
   （本例是 base64(`{"nonce":"…"}`)）
2. 从插件 bundle 取它内置的 OAuth 常量：`grep -o 'clientId:"[^"]*"' main.js`、`redirectUri`
   ⚠️ 内置连接与自建应用的 `redirect_uri` **不同**，用错会得到假的 `redirect_uri_mismatch`
3. **先验证中转端认不认这个 state**（关键，别猜）：
   `curl "<broker>/<callback>?code=bogus&state=<state>"`
   - 回 `Token exchange failed` ⇒ state 被接受（**无状态校验**）**可行**
   - 回 `Invalid state parameter` ⇒ 服务端有记录，此路不通
4. 拼完整 authorize URL，并加 `access_type=offline&prompt=consent`（否则拿不到 refresh token），
   curl 验证返回 **302 到登录页** 而非 `oauth/error`
5. 把 URL 投进用户剪贴板（`Set-Clipboard`），让他在浏览器地址栏粘贴回车走完；
   回调经 `obsidian://…` 弹回宿主，state 与内存中的 pendingAuthState 一致即完成
6. **约束**：期间不许再点 Connect（会换 nonce）、不许重启宿主（内存态丢失）

## 预防

- 给用户讲授权流程时**不要展示任何"看起来能打开"的示例 URL**：写了个带 `?...` 的示例，
  用户当真去访问，Google 回「401 请求格式不正确」，白折腾两轮
- 要用户输入地址，一律 `Set-Clipboard` 投喂并**读回校验**（本机 `Set-Clipboard` 偶发静默失败，
  失败重试一次即好）
- 宿主 UI 常把 ID 之类长串**显示成截断值**，让用户照抄必然出错 → 同上，剪贴板投喂
