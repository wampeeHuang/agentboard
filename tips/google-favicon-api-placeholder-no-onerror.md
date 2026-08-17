# Google Favicon API 返回 200 + 占位图，不触发 img onerror

type: diagnosis
date: 2026-07-19
source: 德城 landing page favicon 自托管，ECHA/IPC 图标加载失败排查

## 现象

`<img src="https://www.google.com/s2/favicons?domain=echa.europa.eu&sz=32" onerror="...fallback...">` — 图片加载成功，`onerror` 回调从未触发，但显示的是一张通用地球图标，不是目标网站的 favicon。用户看到的不是字母 fallback，而是错误的通用图标。

## 根因

Google `s2/favicons` API 找不到目标网站 favicon 时，**不返回 404/500**，而是返回 HTTP 200 + 一张通用占位图（灰色地球）。浏览器认为图片加载成功，不触发 error 事件。

三层叠加：
1. GFW 阻断 Google API → 中国用户所有 favicon 都加载不到，但 API 不报错（TCP 被 RST，浏览器行为不一致）
2. 源站直接拒绝（ECHA 返回 403，IPC 无法连接）→ 无法直接抓取
3. Google API 即使能访问，对找不到 favicon 的域名也返回占位图 → 没有 feedback 信号

**核心认知错误**：把 `onerror` 当作"显示的内容不对就 fallback"——`onerror` 检测的是 HTTP 层错误，不是语义层错误。图不对 ≠ 图加载失败。

## 修复

- 自托管 favicon：用脚本批量下载到 `images/favicons/`，HTML `<img src>` 指向本地路径
- 实在抓不到的域名（ECHA 403、IPC 连不上），不要设 img src 指向 Google API——直接显示纯字母头像（`<span class="avatar-fb show">E</span>`），不兜圈子

## 预防

1. **永远不要在生产环境用 Google Favicon API**。它设计给浏览器地址栏用，不是给网站内容区用的
2. favicon 加载的 fallback 策略：能自托管就自托管，不能自托管就纯字母/纯色块。`onerror` 兜不住"图不对"的情况
3. 外部链接图标的三层降级：本地 PNG → SVG/字母头像 → 无图标（纯文本链接也是 OK 的）
