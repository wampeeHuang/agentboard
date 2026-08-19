---
type: diagnosis
date: 2026-07-14
source: 德城科技 logo 在白色背景上不可见，用 filter 修复反而彻底消失
---

# CSS filter 处理透明 PNG logo 的陷阱

## 现象
透明 PNG logo 在白色背景上看不清，加 `filter: brightness(0) invert(1)` 后 logo 完全消失。

## 根因
`brightness(0)` 把所有非透明像素压成黑色，`invert(1)` 再反转成白色——logo 图案和透明背景变成同一种颜色，细节全毁。叠加 `padding` + `background` 的圆形底只露出背景色环。

## 修复
- 优先用 SVG 替换 PNG（可控填色）
- 非要 PNG 时用 `filter: brightness(0.7) contrast(1.3)` 微调，不极端改色
- 透明 logo 可用 `background: <brand-color>; border-radius` 垫底色，不用 filter

## 预防
处理透明 logo 可见性时，先确认 logo 本身颜色深浅。浅色 logo + 浅色背景 = 先天不可见，CSS filter 救不了，需换源文件或加背景衬托。
