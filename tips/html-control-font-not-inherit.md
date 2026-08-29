---
type: diagnosis
date: 2026-08-23
source: dashboard-leftnav 全站字体统一，扫出 17 处按钮/输入框渲染 Arial
---

# button/input 默认字体是系统 UI 字体，不继承 body 的 font-family

## 现象

页面 `body{font-family:...}` 统一了字体，但 `<button>`（filter-pill、.btn）和 `<input>` 渲染出来还是 Arial。CSS 里没写任何 Arial，全站扫出 17 处非目标字体。

## 根因

HTML 表单控件（button/input/select/textarea）的 UA 默认样式**不是 `inherit`**，而是浏览器指定的系统 UI 字体（Windows = Arial/Segoe UI）。这些元素没显式声明 `font-family` 时，继承链条被 UA 样式切断，直接落系统字体。检查 CSS 永远看不到 Arial——它来自 UA 层。

## 修复

全局兜底规则，让所有控件继承 body 字体：

```css
button, input, select, textarea { font-family: inherit; }
```

## 预防

- 统一样式系统时，全站扫描要覆盖控件：`[...document.querySelectorAll('body *')].filter(el => getComputedStyle(el).fontFamily !== 目标)` 数一遍非目标字体
- 任何 `font-family` 没显式写 `inherit`/具体值的控件，都默认在跑 UA 字体
