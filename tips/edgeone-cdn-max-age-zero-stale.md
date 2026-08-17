# EdgeOne CDN cache-control max-age=0 仍返回 stale HTML

type: diagnosis
date: 2026-07-20
source: evopearl-data Vercel 部署后 EdgeOne 缓存旧 HTML，ETag 不变导致 304 循环

## 现象
Vercel 部署成功（新 HTML 已上线），浏览器访问域名仍看到旧页面。响应头显示 `cache-control: max-age=0, must-revalidate`，但 EdgeOne CDN 返回 304 Not Modified。连续两次部署之间 ETag 不变，304 使浏览器继续用本地缓存。

## 根因
`max-age=0` 只约束浏览器——要求浏览器每次发条件请求（`If-None-Match` / `If-Modified-Since`）验证。EdgeOne 收到条件请求后，如果 ETag 匹配，可以跳过回源直接返回 304。问题出在 ETag 生成——Vercel 源站两次部署产出的 HTML 可能生成相同 ETag（内容差异小、ETag 基于文件大小或弱校验），EdgeOne 认为"没变"就返回 304，实际内容是旧的。

**关键误解**：`max-age=0` ≠ CDN 每次都回源。CDN 在 ETag 匹配时有权跳过回源。`must-revalidate` 只禁止 CDN 在源站不可达时返回过期缓存——源站可达 + ETag 匹配 = 不触发 revalidation，直接 304。

## 修复
1. 手动 cache-bust：浏览器访问 `https://domain.com/?v=任意新值`，绕过已缓存的 URL
2. 登录 EdgeOne 控制台 → 缓存管理 → 手动刷新目录，提交回源刷新
3. 如果频繁出现，在 EdgeOne 缓存规则中为 HTML 设置"不缓存"（注意：这会让所有请求回源，增加源站负载）

## 预防
- 部署后验证时带上随机 query param（`?v=timestamp`），避免被 CDN 304 欺骗
- 关键修复部署后在 EdgeOne 控制台手动刷新缓存
- Vercel 自动部署的预览域（`*.vercel.app`）不走 EdgeOne，可用来对比确认源站内容正确
- 不信任浏览器看到的"部署成功"——实际用户看到的可能仍是 CDN 缓存的旧版
