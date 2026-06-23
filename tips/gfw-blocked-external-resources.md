# GFW 封锁外部资源导致国内手机白屏

type: deploy-gate
date: 2026-06-23
source: vivihuang.evopearl.com 手机端（微信/夸克）白屏排查

## 现象

桌面浏览器正常，手机浏览器（微信 X5 WebView / 夸克）白屏 30-60 秒或直接无法打开。

## 根因

`<head>` 中的 `<link rel="stylesheet">` 引用了 `fonts.googleapis.com` / `fonts.gstatic.com`。这两个域名在中国大陆被 GFW 封锁。浏览器解析到 `<link>` 时暂停渲染等待 CSS 下载 → 请求被墙挂起 → 超时前全白屏。

桌面浏览器走了代理所以一直正常，手机纯国内网络就打不开。

## 诊断

检查 `<head>` 中是否存在 render-blocking 外部资源：

```
grep -rn "fonts.googleapis.com\|fonts.gstatic.com\|googleapis.com\|gstatic.com" *.html css/
```

另外检查 `@font-face` 是否引用了超大本地 TTF（如 Noto Sans/Serif SC 单个 10-15MB，全套可达 88MB），手机网络下载耗时同样不可接受。

## 修复

1. 移除所有 Google Fonts `<link>` 标签
2. 移除引用超大 TTF 的 `fonts.css`
3. 回退到纯系统字体栈：`"Helvetica Neue","Helvetica","PingFang SC","Microsoft YaHei UI","Arial",system-ui,sans-serif`

## 预防

部署管线加入 Step 0.5 门禁：扫描所有 HTML/CSS 中的外部域名，命中封锁列表则阻断部署。

封锁域名清单（中国大陆 GFW）：
- `fonts.googleapis.com`, `fonts.gstatic.com`
- `*.googleapis.com`, `*.gstatic.com`
- `google-analytics.com`, `googletagmanager.com`
- `ajax.googleapis.com`
- `youtube.com`, `twitter.com`, `facebook.com`, `instagram.com`
- `cdn.jsdelivr.net`, `unpkg.com`（部分封锁/不稳定，flag 为 warn）
