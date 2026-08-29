---
type: diagnosis
date: 2026-08-26
source: scheduler 触发模型重构会话，产出气泡迭代——CDP 测试显示旧 handler 行为
---

# 前端资源改动未 bump 版本串 → 自动化测试加载旧代码假复现

## 现象

改完 `app.js`/`builder.css`，跑 CDP 端到端测试，测试结果仍是旧行为（handler 输出 `top:0px` 的旧定位逻辑）。`node --check` 通过、服务端 curl 返回的是新代码——但浏览器里跑的却是旧的。排查多轮才定位。

## 根因

静态站点用 `index.html` 的查询版本串做 cache-buster（`<script src="/js/app.js?v=20260826k">`）。改了 JS/CSS 但**没 bump 版本串**时，URL 没变，浏览器 HTTP 缓存命中旧资源。测试用的持久化浏览器（有 user-data-dir）跨多次导航缓存了该版本串的旧文件，于是"服务端新、浏览器旧"。

## 修复

1. 改前端资源（JS/CSS/favicon）后**立即 bump** `index.html` 所有 `?v=` 版本串（统一后缀递增）。
2. 验证前 `curl` 服务端实际 URL，grep 新代码特征确认服务端已新（防服务端侧缓存/代理）。
3. 必要时 CDP `Page.navigate` 带 `ignoreCache:true` 或删测试浏览器缓存。

## 预防

- 固定顺序：改前端 → bump 版本串 → 再跑测试。顺序不可省，bump 是变更的一部分不是附加。
- 测试脚本断言"页面加载的代码包含本次改动特征串"（如 handler 新函数名），比只断言行为更快暴露旧代码。
- 同类坑已三次：服务端缓存 nav.html ×2（08-25）+ 本次浏览器缓存 query 版本。改前端后先验证"跑的是新代码"再信测试结果。
