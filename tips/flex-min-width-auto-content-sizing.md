# flex 子项 min-width: auto 会撑破固定 flex-basis

type: diagnosis
date: 2026-07-24
source: 德城 landing page 流程卡片手机端宽度不一致，160px~197px 浮动

## 现象

水平滚动 flex 列表中，`.flow-step { flex: 0 0 160px; min-width: auto; }` 设定所有卡片统一 160px，但实际渲染宽度 160px~197px 不等。`getComputedStyle` 显示 flex-basis 确实是 160px。

## 根因

CSS flexbox 规范：flex 子项的 `min-width: auto` 等价于内容的 `min-content` 尺寸（不是 "不设最小宽度"）。内容内有 `white-space: nowrap` 的长文本时，min-content 尺寸 > flex-basis，导致卡片被撑宽。`flex-grow: 0` 和 `flex-shrink: 0` 都挡不住 `min-width` 的覆盖。

最宽卡片 197px（"JUKI 高速线 · 01005 贴装"），最窄 160px，差距 37px。

## 修复

```css
/* 错误 */
.flow-step { flex: 0 0 160px; min-width: auto; }
/* 正确 */
.flow-step { flex: 0 0 200px; min-width: 0; }
```

`min-width: 0` 让 flex-basis 成为唯一宽度约束。同时取最宽卡片内容（~196px）向上取整作为统一宽度。

## 预防

水平滚动的 flex 列表要统一子项宽度，两条缺一不可：
1. `flex: 0 0 <width>` — 固定 flex-basis
2. `min-width: 0` — 关闭 min-content 自动撑宽

验证方式：`querySelectorAll` 取所有子项 `getBoundingClientRect().width`，new Set 去重，size 必须为 1。
