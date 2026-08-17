# IntersectionObserver rootMargin 不支持 vh 单位

type: capability
date: 2026-07-15
source: 德城 landing page hero — header 滚动触发时机调试

## 现象

`IntersectionObserver` 构造函数 `rootMargin: '-40vh 0px 0px 0px'` 报错：
`Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.`

随后 IO 完全不工作，header 滚动后不变白。Chrome DevTools console 有报错但未被注意到。

## 根因

`IntersectionObserver` 的 `rootMargin` **只支持 px 和 %**，不支持 vh/vw/em/rem 等 CSS 单位。这是浏览器 API 规范限制，不是 CSS bug。

CSS 中 `margin` 等属性支持 vh，但 IO 的 `rootMargin` 是独立解析器，单位白名单更严格。

## 修复

```js
// 错误
rootMargin: '-40vh 0px 0px 0px'

// 正确 — 使用 %（相对于 viewport 尺寸）
rootMargin: '-40% 0px 0px 0px'
```

`-40%` = viewport 高度的 40%。与 `-40vh` 在数值上等效，但使用 IO 支持的单位。

## 预防

- 任何涉及 `IntersectionObserver` 的代码，写 `rootMargin` 时只用 px 或 %
- 如果需要 vh 等效值，用 `%` 换算（1vh = 1% of viewport height）
- Lint 规则：CI 中扫描 `rootMargin.*vh` 并报错
