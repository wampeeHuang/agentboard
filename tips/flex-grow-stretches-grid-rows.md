---
type: diagnosis
date: 2026-07-10
source: feishu-bot dashboard — card labels not aligning across cards despite fixed 20px grid rows
---

# flex:1 on grid container silently destroys fixed row heights

## 现象
CSS Grid 容器内行高设为 `height: 20px`（绝对像素），但渲染结果各行高度被拉伸，跨卡片标签无法水平对齐。Chrome DevTools 检查 `height: 20px` 规则生效但实际渲染高度不对。

## 根因
Grid 容器的父级是 flex column，grid 容器上写了 `flex: 1`（即 `flex-grow: 1`）。父级有固定高度后，flex-grow 让 grid 容器吃掉所有剩余空间，把内部 grid rows **按比例拉伸**——`height: 20px` 变成 `height: 28px` 之类，肉眼看不出来但累积偏移严重。

`flex: 1` = `flex-grow: 1` + `flex-shrink: 1` + `flex-basis: 0`。关键在 `flex-grow: 1` — 它把容器撑大，grid rows 被拉伸，不是你写的 20px。

## 修复
```css
/* 之前 */
.grid-container { flex: 1; }

/* 之后 */
.grid-container { flex-shrink: 0; }
```
去掉 flex-grow，grid 容器只取内容高度，内部 20px 行高绝对生效。

## 预防
- 任何 grid 容器用绝对行高（`height: Npx` 而非 `auto`/`fr`）时，检查父级 flex 上下文是否有 `flex-grow`
- 固定行高 + flex-grow = 一定漂移。两个同时存在就改了其中一个
