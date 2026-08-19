---
type: diagnosis
date: 2026-08-05
source: 版式画廊 /library 卡片预览不显示——误诊 IntersectionObserver/RAF 时序，实际是 opacity:0
---

# 元素不可见先查 CSS 可见性属性，再查异步加载逻辑

## 现象

页面元素（iframe、卡片、图片等）不显示，但 DOM 中确实存在。初始假设是 JS 异步加载问题（IntersectionObserver、RAF、getBoundingClientRect 零值），在这个方向调试了 4 小时，改了 4 版代码，无果。

## 根因

CSS `.card-preview iframe { opacity: 0 }` 被 Turbo 从首页带入 `/library` 页面。浏览器的 Computed Styles 面板中一眼就能看到 `opacity: 0`——但诊断跳过了 CSS 可见性，直接进入了异步时序分析。

误诊核心：从"不可见"没直接排查 CSS 可见性（opacity/visibility/display），而是跳到了"为什么没加载"的异步逻辑。

## 修复

诊断顺序（按成本从低到高）：

1. **DevTools Elements → Computed** — 看 `opacity`、`visibility`、`display`、`z-index`、`width/height=0`、`overflow:hidden` 裁剪
2. **Elements → Styles → 筛选 "hidden"/"opacity"/"none"** — 快速定位隐藏规则
3. **框架缓存** — Turbo/bfcache/React state 污染
4. **JS 异步逻辑** — IntersectionObserver、RAF、scroll、resize
5. **布局计算** — getBoundingClientRect、offsetWidth/Height

前三步 5 分钟内走完。第 4 步之后才是重武器。

## 预防

元素"不可见"是 CSS 问题直到证明不是。第一步永远是打开 DevTools Computed 面板看可见性属性。不要从最难的可能性开始排查。
