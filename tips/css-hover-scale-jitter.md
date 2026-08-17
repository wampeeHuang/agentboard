# CSS transform:scale() hover 导致元素震荡

type: diagnosis
date: 2026-07-29
source: vivihuang-portfolio #xitong 架构环图节点 hover 效果

## 现象
鼠标悬停 SVG 节点卡片时，元素反复缩放抖动（震荡），无法稳定在 hover 状态。`transform: scale(1.06)` 看起来正常，实际鼠标在边缘反复进出。

## 根因
`transform: scale()` 只改变视觉渲染，不改变元素在布局中的 hit area。元素放大后，鼠标可能落在"视觉在元素内、但 hit area 在元素外"的区域 → 触发 mouseleave → scale 还原 → 鼠标又落入 hit area → 触发 mouseenter → 循环震荡。

任何改变元素视觉尺寸但不改变布局尺寸的 CSS 属性（scale、rotate、translate 的 transform 系列）都有此陷阱。

## 修复
用不影响布局尺寸的 visual-only 属性：
- `filter: drop-shadow()` — 阴影不占布局空间
- `stroke` / `border-color` 颜色变化
- `outline` / `box-shadow` — 在元素外围画框

本次修复：
```css
/* 旧 — 震荡 */
.lev-node:hover { transform: scale(1.06); }

/* 新 — 稳定 */
.lev-node rect { transition: filter .25s ease, stroke .25s ease; }
.lev-node:hover rect { filter: drop-shadow(0 3px 12px rgba(0,0,0,.15)); }
.lev-node--amber:hover rect { stroke: #92400E; }
```

## 预防
交互元素 hover 效果首选 `box-shadow` / `filter:drop-shadow` + 颜色变化。必须缩放时用 `transform: scale()` 配合 `transform-origin: center` 并确保父容器给够 overflow 空间，但仍无法完全避免边缘震荡。
