# EdgeOne CDN 缓存按 URL 独立，purge 页面不联动刷新子资源

type: diagnosis
date: 2026-07-24
source: 德城 landing page 替换 aoiuser-01005-precision.jpg 后线上仍然是旧图，已 purge 页面 URL

## 现象

Vercel 部署新版本 → purge EdgeOne 页面 URL `https://dechpcba.evopearl.com/` → curl 验证 HTML 含新 CSS → 但图片仍然是旧的 800×600（新版是 600×800）。

## 根因

CDN 缓存粒度是 URL，不是"页面"。`/` 和 `/images/factory/aoi-01005-precision.jpg` 是两个独立缓存对象，purge 一个不联动另一个。

Vercel 部署 URL 被 SSO 保护（302 跳转登录），无法绕过 CDN 直接验证原点是否已更新。

验证手段：curl 下载图片 → PIL 检查尺寸 → 对比本地文件。

## 修复

每个变动的资源 URL 单独 purge：

```python
req.Targets = [
    'https://dechpcba.evopearl.com/',
    'https://dechpcba.evopearl.com/images/factory/aoi-01005-precision.jpg',
]
```

## 预防

1. 部署后验证不只查 HTML，静态资源（图片/CSS/JS）同样查
2. 改了什么文件就 purge 什么 URL —— 页面 + 所有变动资源
3. 更可靠的方案：静态资源用内容 hash 做文件名（如 `aoi-01005-precision.a1b2c3.jpg`），改内容必然改 URL，CDN 不可能命中旧缓存
4. 验证 CDN 缓存状态：`curl -sI` 看 `EO-Cache-Status: MISS` 说明已刷新
