---
type: diagnosis
date: 2026-08-27
source: manual 顶栏对齐会话 — 改完 web/manual.html 用户浏览器仍显旧内容, 排查发现三处缓存/路由坑
---

# supervisor web 静态文件改后不生效: 无缓存击穿通道, 只能硬刷新

## 现象

改了 `web/manual.html`（supervisor.js `serveDoc` 每次读盘直发、无 Cache-Control 头），`curl localhost:3097/manual` 已返回新 HTML，但浏览器面板里还是旧内容。用户/Agent 都以为没生效。

## 根因

三层叠加，单独看任一层都不够：

1. **serveDoc 无缓存头 → 浏览器启发式缓存**：`res.writeHead(200, {'Content-Type':'text/html;...'})` 不带 `Cache-Control`/`ETag`。HTML 没显式缓存指令，浏览器按启发式规则缓存一段时间，同 URL 再取命中旧文件。
2. **面板 iframe 只在面板加载时拉一次**：`#page-docs` 的 `<iframe src="/manual">` 加载后，切服务/说明书页只是 `display` 切换，**不重发请求**。面板不整体刷新，iframe 内容永远不会更新。
3. **路由精确匹配禁 query 击穿**：supervisor 路由是 `if (req.url === '/manual')` 精确字符串比较。想用 `?t=xxx` 缓存击穿，URL 变 `/manual?t=xxx`，直接 404（`serveDoc` 返回 "not found"）。想 bump 版本串的路被堵死。

## 修复

1. 改完 `web/*` 后，验证服务端已新：`curl -s localhost:3097/manual | grep '<新特征>'`
2. 浏览器必须**硬刷新**（Ctrl+Shift+R）才能看到 manual/panel 变更——普通 F5 都可能命中启发式缓存。
3. 若在自动化测试/无头浏览器里验，用全新 `--user-data-dir` 起 headless（持久 profile 会跨导航缓存旧文件，见 `frontend-asset-cache-buster-not-bumped-test-stale`）。

## 预防

- 改 supervisor web 静态文件（manual.html/panel.html/panel.css）后，**主动告知用户硬刷新**，别等用户报"没生效"。
- 不要给 supervisor 的精确匹配路由加 query 缓存击穿——它不认。
- 治本方向：给 serveDoc/serveCss 加 `Cache-Control: no-cache`（每次重验证），或支持版本串。当前未做，刷新靠硬刷。
