---
type: diagnosis
date: 2026-07-29
source: 个人站系统板块架构图 — 图例文字在用户浏览器垂直偏移、与色块重叠，MCP DevTools 浏览器却正常
---

# SVG `dominant-baseline` 跨浏览器不可靠，用 `dy=".35em"` 代替

## 现象

`dominant-baseline="central"` 在 MCP Chrome DevTools 浏览器垂直居中正常，用户浏览器文字错位、与相邻色块重叠。"调度 & 执行"和"验证 & 沉淀"两行标签完全不可读。

## 根因

`dominant-baseline` 在各浏览器实现不一致：

- Chromium 部分版本：`central` 和 `middle` 映射到不同基线，行为分裂
- Firefox：早期版本不支持 `central`，只认 `middle`
- SVG 呈现属性域和 CSS 属性域不同，`dominant-baseline` 作为呈现属性的解析路径各浏览器不同

同时 CSS 变量在 SVG 呈现属性中也不可靠：`font-family="var(--mono)"` 中的 `var()` 是 CSS 函数，在 XML/SVG 属性解析器中不被识别，变量不解析、字体回退到默认，文字宽度不可预测。

## 修复

两招，一起用：

**1. 纵向居中：用 `dy=".35em"` 代替 `dominant-baseline`**

```html
<!-- ❌ 不可靠 -->
<text y="130" dominant-baseline="central" text-anchor="middle">文字</text>

<!-- ✅ 全平台兼容 -->
<text y="128" dy=".35em" text-anchor="middle">文字</text>
```

`.35em` ≈ 中文字形视觉中心到基线的距离。`dy` 在 SVG 1.1 就有，所有浏览器一致。

**2. CSS 变量：用 CSS 类，不用 SVG 呈现属性**

```html
<!-- ❌ var() 在 SVG 属性中不解析 -->
<text font-family="var(--mono)" font-size="11px">标签</text>

<!-- ✅ CSS 类走标准级联 -->
<style>.lbl { font-family: var(--mono); font-size: 11px; }</style>
<text class="lbl">标签</text>
```

## 预防

- SVG `<text>` 禁止出现 `dominant-baseline` 属性 — 一律用 `dy=".35em"`
- SVG 呈现属性中禁止写 `var()` — 需要 CSS 变量时建 CSS 类，`fill`/`stroke` 属性中 `var()` 例外（走 `var(--token, #fallback)` 模式，fallback 保底）
