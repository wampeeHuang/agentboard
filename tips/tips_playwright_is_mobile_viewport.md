# Playwright is_mobile:True 导致 window.innerWidth 虚高

type: trap
date: 2026-07-22
source: decheng-landing-page audit-mobile.py

## 现象

Playwright 设置 `viewport={"width": 375, "height": 667}` + `is_mobile: True`，但 JS 中 `window.innerWidth` 返回 575px（不是 375px）。CSS 媒体查询正确匹配（MQ479/MQ767 都是 true），页面元素渲染宽度也正确（375px），但 JS 测量值错误。

## 根因

Chromium headless 在 `is_mobile: True` 模式下，移动端 UA + touch 事件模拟会影响 viewport 内部计算。`window.innerWidth` 报告的是包含滚动条/OS UI 补偿的"逻辑视口"，不是 CSS 视口。`document.documentElement.clientWidth` 更可靠。

## 修复

1. JS 审计脚本用 `document.documentElement.clientWidth` 而非 `window.innerWidth`
2. 把 Playwright 设置的真实 viewport 宽度作为参数传入 JS，做 fallback：`Math.min(documentElement.clientWidth, expectedW)`
3. 如果不需要 UA/touch 模拟，关掉 `is_mobile` 也能恢复正常

## 预防

- 任何 Playwright 移动端 + JS viewport 测量的组合，不要信任 `window.innerWidth`
- 用 `page.evaluate("document.documentElement.clientWidth")` 做基准
- 在 CI 中对比 `documentElement.clientWidth` 和 Playwright 设置的 viewport 宽度，偏差 >5px 时报警
