---
type: diagnosis
date: 2026-08-16
source: layout-gallery Stage 3 体 token 化，compile.mjs hardcoded-px 门禁把 22 处 `@media (max-width: Npx)` 断点误标为"该 token 化"
---

# CSS 自定义属性不能进 @media 条件——断点是架构常量不是 token

## 现象
迁移 body CSS 硬编码值为 var() token 引用时，px 扫描门禁把媒体查询断点里的 px 也当成可迁移硬编码，要求 `@media (max-width: 768px)` 里的 768px 也换成 `var(--bp-*)`。

## 根因
CSS 规范规定：`@media` / `@container` 的条件表达式里**不能使用 var() 自定义属性**。媒体查询在样式解析早期求值，此时自定义属性尚未级联求值。断点 px 是架构常量，不是可 token 化的值。门禁一刀切"出现 px = 该 token 化"是错的——这类是"合法的非 token 化硬编码"。

## 修复/步骤
扫描门禁加 at-rule 豁免：
```js
const atRule = /^\s*@(media|container)\b/.test(line);
if (!atRule) { /* 才跑 hardcoded-px 扫描 */ }
```

## 预防
任何"扫硬编码值要求 token 化"的门禁，必须维护一份**合法豁免清单**，不能一刀切把"出现 px"当"该 token 化"：
- `@media` / `@container` 断点
- `@keyframes` 百分比、`@supports` 条件
- `calc()` 内的单元换算、`aspect-ratio` 分子分母

门禁设计先问："这个值 token 化后语义还成立吗？"不成立的就是豁免项，不是 bug。
