# 服务端 Session 过期 ≠ 浏览器刷新能续
type: diagnosis
date: 2026-06-15
source: XHS Cookie 检测 — 用户刷新页面后 Cookie 仍过期，排查发现 web_session 是服务端 token

## 现象
用户按提示"浏览几个页面再提取 Cookie"，粘贴后检测仍然过期。页面能正常访问，但 API 调用全部返回 SessionExpiredError（code: -100/-1）。

## 根因
`web_session` 是服务端签发的 session token，过期时间由服务端决定。浏览器刷新页面用的是已有 Cookie 发请求——服务端看到同一个过期 token，不会签发新的。只有**重新登录**（扫码/手机号）才会生成新的 `web_session`。

这不是 XHS 特有的。任何服务端 session 机制（JWT、opaque token）都遵循这个模式——客户端无法单方面续期。

## 修复/步骤
1. 不要给用户"刷新页面"的建议——这不会续期 session token
2. Cookie 检测过期时，直接提示"请重新登录后提取 Cookie"，不要建议浏览页面
3. 检测端点的过期条件要精确到 error code，不要靠"试一下能不能调通"

## 预防
- 任何平台接入时先搞清楚：token 是客户端可以刷新的（如 OAuth refresh_token），还是纯服务端控制的（如 web session）？
- 前者的过期提示写"重新授权"，后者的过期提示写"重新登录"
- 不要把"页面能打开"等同于"Cookie 有效"——页面请求和 API 请求的鉴权路径可能不同
