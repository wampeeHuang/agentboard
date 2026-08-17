---
type: diagnosis
date: 2026-08-01
source: agentboard 原则库路由调试——/principles 路由定义正确但始终返回 301
---

# Express 静态中间件劫持同名路由目录

## 现象

`app.get('/principles', handler)` 定义在 `express.static(root)` 之前，但请求 `/principles` 始终返回 301 redirect 到 `/principles/`。`/principles/` 返回 404。代码语法检查通过，路由看似正确注册。

## 根因

`express.static(root)` 的 `root` 目录下存在同名子目录（如 `root/principles/`）。静态中间件检测到该路径是目录 → 301 redirect 加 trailing slash → 在目录内找 `index.html` → 找不到 → `next()` → 404。

**致命烟雾弹**：`/principles/CONSTITUTION.md` 返回"看起来正确"的内容（markdown 原文），让人误判路由已生效。实际上是静态中间件直接返回的原始文件，不是路由处理器渲染的。

此模式下服务器没跑新代码，只是静态中间件给了假阳性信号。

## 修复

1. 确认 server 进程确实重启了（`netstat -ano | findstr "3099"` 查 PID，对比进程启动时间）
2. 路由定义必须在 `express.static` 之前注册
3. 无法重启时（进程提权），不能仅凭"某个路径返回了内容"就认定路由已生效

## 预防

- 新路由上线后第一个测试：`curl -sI <url>` 看状态码和 Content-Length，不该是 301
- 内容看起来"正确"≠路由生效。对比预期响应大小——静态文件通常远小于渲染后 HTML
- `app.use(express.static(...))` 加 `{ redirect: false }` 可禁用目录 301 重定向，但不治本
