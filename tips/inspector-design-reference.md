---
type: method
date: 2026-07-22
source: scheduler /cron 底部设计原理+架构图重设计，4 轮迭代才收敛
---

# Dashboard UI 以 Inspector panel.html 为视觉参考系

## 现象

重设计 scheduler 仪表盘底部板块（设计原理 + 架构图），用户反复反馈"架构图还是很花"→"架构图完全不对了"→"参考下 localhost:3102 的架构图"。4 轮迭代（SVG 太花 → CSS 盒子太简 → Mermaid SVG → Inspector 同款 SVG）才收敛。

## 根因

scheduler 和 Inspector 是同一生态的两个面板（共享 CSS 变量调色板、共享 Swiss editorial 设计语言），但每次改 scheduler UI 都从零设计，没把 Inspector panel.html 当参考系。用户心里已经有 Inspector 的视觉标准，新设计不符合就反复打回。

## 修复/步骤

1. 改 scheduler dashboard 任何 UI 前，先读 `C:\Users\Administrator\.inspector\panel.html` 提取当前设计模式
2. 三件套对齐：CSS 变量（`--bg: #faf9f5` 等）、板块结构（`<details class="sec-details">` + caret + sec-title + sec-desc）、SVG 图表风格（白卡片 + terracotta 箭头 + drop shadow + monospace 技术标注）
3. 同一生态内的面板共享设计语言——不是复制代码，是继承视觉约定

## 预防

Scheduler / Inspector / Agentboard 三个面板共享同一设计系统。改任何一个面板的 UI 前，先开另外两个看一眼当前视觉约定。视觉一致性的标准不是"看起来差不多"，是"看不出是两个人写的"。
