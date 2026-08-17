# CSP style-src 'self' 封锁所有行内 style 属性

type: tip
date: 2026-08-05
source: source-rack UI 重构 — CSP 收紧后大量样式失效

## 现象
CSP 设置为 `style-src 'self'`（去掉 `'unsafe-inline'`），页面元素样式丢失、布局错乱。浏览器 Console 报 CSP violation。

## 根因
`style-src 'self'` 只允许 `<link rel="stylesheet">` 加载的外部 CSS 文件。HTML 中的三种写法全部被拦截：
1. `<div style="display:flex">` — 行内 style 属性
2. `<style>body { ... }</style>` — 内联 `<style>` 标签
3. `el.style.display = 'flex'` — JS 动态设置（部分浏览器也拦截）

## 修复
- 所有 `style="..."` 属性 → 提取为 CSS class
- `<style>` 标签内容 → 移到外部 `.css` 文件
- JS 动态样式：声明 `style-src 'self' 'unsafe-inline'` 或用 `classList.toggle()` 代替直接改 style

## 预防
改 CSP 之前先 grep 全项目：`grep -rn 'style="' *.html` 和 `grep -rn '<style>' *.html`。改完后用浏览器 Console 逐一清 CSP violation。
