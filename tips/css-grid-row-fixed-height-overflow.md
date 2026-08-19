---
type: method
date: 2026-08-05
source: source-rack UI 重构 — 数据行完全重叠
---

# CSS Grid 行固定高度导致内容溢出重叠

## 现象
CSS Grid 模拟表格，`.row { height: 36px }` 固定高度。内容（描述文字、多个 domain badge、tag）溢出到下一行，视觉效果是所有行交叠在一起。

## 根因
`height` 固定盒子高度，内容溢出后 `overflow: visible`（默认）导致内容渲染到下一行的空间。Grid 不感知每个 cell 的内容高度。

## 修复
```css
.row {
  min-height: var(--table-row-h);  /* 用最小高度替固定高度 */
  align-items: start;              /* 顶对齐，不居中 */
}
```

## 预防
用 Grid 做表格布局时，永远用 `min-height` 不是 `height`。除非确定所有行内容都是单行文本，否则不设固定高度。
