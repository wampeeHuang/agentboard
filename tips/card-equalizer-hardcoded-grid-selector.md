# 均衡/对齐脚本硬编码一个网格选择器，新增同类容器后漏覆盖

type: diagnosis
date: 2026-08-19
source: vivihuang portfolio 应用卡片底部「设计原则说明」对不齐，只有建筑区对齐

## 现象

同一页面里两种卡片网格长得一模一样（都叫 `.project-card`），一个网格卡片等高对齐正常，另一个网格错位——应用卡片底部「设计原则说明」每张高度不一，视觉对不齐。

## 根因

等高的 JS 均衡函数（用 `offsetHeight` 取全局最大、写回 `minHeight`）开头写死了一个选择器：

```js
document.querySelectorAll('.project-list').forEach(function(list) { ... });
```

页面里有两个网格容器：`.project-list`（建筑区）和 `.tool-grid`（应用区）。函数只覆盖了前者，后者从来没被均衡过。症状因此分裂成「一半对齐一半不对齐」。

## 修复/步骤

1. 读均衡函数，找出硬编码的选择器。
2. 选择器改成覆盖全部同类容器：`'.project-list, .tool-grid'`。
3. 补两个接线点：把均衡函数暴露到 `window`（`window.alignCards = align`），在分类筛选的 `applyFilter()` 里调用一次——否则点 tab / 展开「更多」后 `.hidden`/`.collapsed` 切换，均衡不会重跑，重新错位。
4. 验证别截图：`chrome --headless --dump-dom URL` 后 grep 卡片上的 `min-height` 内联样式，确认目标卡片都吃到了均衡值。

## 预防

- 均衡/对齐/布局脚本不要硬编码具体网格 class，用一个共享选择器（统一 class 或 `[data-equalize]` 属性）覆盖所有目标容器。
- 新增第二个同类网格时，`grep` 一下现有均衡脚本的选择器，确认新容器被覆盖。
- 「同类卡片一半对齐一半不对齐」这个症状 = 均衡脚本选择器漏覆盖，直接读选择器那行。
