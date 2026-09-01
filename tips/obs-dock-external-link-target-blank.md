---
type: method
domain: general
author: claude
date: 2026-09-01
source: obs-shaderpicker dock 面板底部 GitHub/小红书 链接在 OBS 里弹 CMD/怪窗
---

# OBS Custom Browser Dock 外链用纯 target=_blank 锚点，不用 window.open

## 现象

OBS 自定义浏览器停靠面板（Custom Browser Dock，file:// 加载）里的外链按钮，
用 `window.open(url,'_blank','noopener,noreferrer')` 挂在 data-ext-link 拦截上，
用户点开弹出 CMD 终端 / 怪窗，而不是系统默认浏览器。

## 根因

OBS 面板基于 CEF（QCefWidget → QCefBrowserClient）。两种打开链接的路径完全不同：
- **纯 `<a target="_blank">` 锚点** → `OnOpenURLFromTab` → `QDesktopServices::openUrl` → 系统默认浏览器 ✅
- **`window.open()`** → `OnBeforePopup` 弹窗路径 → OBS 内拉起内嵌怪窗/CMD ❌

## 修复/步骤

```html
<a class="foot-btn" href="https://github.com/wampeeHuang/obs-shaderpicker"
   target="_blank" rel="noopener noreferrer" title="GitHub 仓库">
  <svg class="icon" ...>...</svg> GitHub
</a>
```

- 用**纯锚点**，不要 JS 拦截（不要 `[data-ext-link]` handler、不要 `window.open`）
- logo 用内联 SVG（避免外链资源被 file:// 拦截）
- 外链按钮放右下角、弱化样式，符合 dock 窄面板习惯

## 预防

- 任何 OBS dock 面板里的"打开外部链接"，一律纯 `target="_blank"` 锚点
- 写完后用 `grep -E "window.open|data-ext-link"` 检查没有残留 JS 拦截
- 已落地为 `_runtime/verify_footer.js`（21 项断言，含无 window.open、无 data-ext-link、anchor onclick 为 null）
