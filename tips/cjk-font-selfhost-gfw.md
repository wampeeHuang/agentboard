---
type: method
date: 2026-08-19
source: vivi-harness 首页字体「十分难看」→ 自托管思源宋体/黑体（绕开 GFW，不 fallback 系统字体）
---

# CJK 字体自托管：css2 unicode-range 切子集 + GFW 重试续传

## 现象

中文站想要真实字体（思源宋体标题 + 思源黑体正文），但：
- 直连 Google Fonts `<link>` 被 GFW 拦，国内白屏或字体加载失败
- CJK 字体整包巨大（单个 10-15MB，全套 88MB），不能整个下载
- fallback 微软雅黑/宋体 = 没设计感，用户嫌丑

## 根因

`fonts.googleapis.com` / `fonts.gstatic.com` 在大陆被 GFW 封锁；CJK 字形上万个，完整字体必然巨大。两者叠加：既不能直连，也不能整包下。

## 修复/步骤

Google Fonts **css2 API 按 `unicode-range` 把 CJK 切成 ~120 块**，浏览器按页面实际用到的字，只加载命中的子集。自托管这些子集 = 绕过 GFW + 体积可控。

1. 构造 css2 URL：`https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;500&family=Noto+Sans+SC:wght@400&display=swap`
2. **必须带 Chrome UA** 请求，才返回 woff2（默认返回 ttf，白大 3 倍）
3. 解析返回的 `@font-face` 块，提取每个子集的 `url` + `unicode-range`
4. 下载脚本四件套：**重试 + 指数退避 + 断点续传（跳过已存在文件）+ 120ms 间隔**——GFW 会 ECONNRESET，裸下必断
5. 生成 `fonts.css`：每个子集一个 `@font-face`，`src` 指向本地 woff2，保留原 `unicode-range`
6. 自托管到 `site/assets/fonts/`，HTML 只 `<link>` 本地 `fonts.css`

参考脚本：`D:\workspace\vivi-harness\scripts\fetch-cjk-fonts.js`。

## 预防

- 中文站要真实字体 → 自托管 CJK 子集，**不 fallback 系统字体、不直连 Google Fonts**（直连 = 部署管线 Step 0.5 门禁应拦截的 GFW 域名）
- 下载 CJK 字体默认字重只下 300/400/500，`<strong>` 默认 bold=700 会缺失 → 显式 `font-weight: var(--fw-medium)` 覆盖
- 下载脚本必带：Chrome UA + 重试退避 + 续传，三者缺一 GFW 环境下跑不完
