---
type: diagnosis
date: 2026-08-26
source: 说明书「打开设计系统说明书」链接失效排查
---

# http 页面禁跳 file://，skill 本地文档要走目录级代理

## 现象
Dashboard 说明书页「打开设计系统说明书」链接指向 `file:///C:/.../vivi-design-system/docs/设计系统说明书.html`，点击无反应（浏览器控制台：`Not allowed to load local resource`）。改成单文件代理后页面能开但图片/字体全裂。

## 根因
两层：
1. **http:// 页面不能导航到 file:// 资源**——Chrome 安全策略直接拦截，`<a href="file://...">` 点了等于没点。
2. **说明书有 `../assets/...` 相对资源**——只代理单文件时，`../assets/` 会解析到服务器根，404。必须按目录级挂载，让相对路径在服务器端成立。

## 修复
```js
// lib/static.js — 目录级只读代理，保留相对资源
app.use('/skill-docs/vivi', express.static(path.join(os.homedir(), '.claude', 'skills', 'vivi-design-system')));
// 链接 target="_blank" rel="noopener"，新标签打开不劫持 iframe
```
中文文件名路径 curl 直接发会被当未编码 → 404，浏览器自动编码不受影响；用 node `encodeURI` 自测。

## 预防
- 面板页引 skill/外部目录文档，一律走 `express.static` 目录挂载，禁 `file://`。
- 新页面加链接后浏览器实测（含相对资源），不只 curl 状态码。
