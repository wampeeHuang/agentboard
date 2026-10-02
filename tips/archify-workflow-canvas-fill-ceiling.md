---
type: fact
date: 2026-10-03
domain: general
author: dsh-agent
source: 作者两次反馈说明书里的架构图「看不全」，重做图并逐一实测五种改法
---

# Archify workflow 图的画布填充率上限约 91%：autoHeight 里 124 单位图例预留改不掉
## 现象

生成的 workflow 图**底部总有一段空画布**：图例下面到画布底还留着明显空白，
作者会把它反馈成「看不全」「没有补全内容」。

## 根因

`renderers/workflow/workflow-compiler.mjs`：

```js
autoHeight = laneY(52) + Σ laneHeights + (lanes-1) * laneGap(20) + 124 + legendExtraHeight
viewBox    = workflow.meta?.viewBox || [minimumCanvasWidth, autoHeight]
legendY()  = lastLaneBottom() + 44 + legendExtraHeight     // 这个 44 写死
```

那 **124 是给图例的固定预留**，而图例实占仅约 35 单位。于是填充率恒为：

```text
内容底 / 画布高 = (H − 124) / H
```

**与泳道数、泳道高、节点数全部无关**——加内容会让 `autoHeight` 同步变大，比值不变。
实测印证：3 泳道 534 高 → `534 − 463.21 = 70.79`；5 泳道 786 高 → `786 − 715.04 = 70.96`。
把图做高做密能把填充率从 **86.7% 提到 91.0%**，但 **95% 需要 H ≥ 1460**，在那个宽度下已不可读。

## 已实测确认无效的五种改法（别再试）

| 改法 | 结果 |
|---|---|
| `meta.viewBox` 指定更小高度 | 被拒：`minimum 1124×534`（requiredViewBox 是硬下限） |
| 逐步调小 viewBox | 无空间 |
| `meta.legend = {"mode":"hidden"}` 后重新 deliver | **viewBox 仍是 534**，图例不是原因 |
| 加高 iframe | svg 等比缩放，空白按比例一起放大 |
| 覆盖 svg 的 `viewBox` 属性（改 CSS 属性） | 宽高比变化 → **裁掉左右两边** |

另外 **「泳道内多行 + yOffset」被框架硬禁**：校验器要求同泳道节点矩形间距 ≥8，
104 高的泳道里两行 68 高节点最多拉开 8 单位，必然报 `workflow/node-overlap`；
把泳道抬到 178 也只增加行距、不增加行数。

## 修复/步骤

**接受约 91%，改用交付形态解决「看全」**：

1. 想让图**更大**：把 iframe 高度调到 svg 的实际渲染高
   （`svg 宽 × viewBox 高 ÷ viewBox 宽 + 内边距`），此时内部无滚动。
   注意图在 iframe 里是按框高画满的，**加高框不会让内容变大**，只会多出空白。
2. 想让读者**看清**：另出一张静态大图（宽视口渲染 + 按已知几何裁掉 padding），
   在正文里给链接；必要时再挂一个只读静态服务给固定地址。
3. 判断图有没有被裁，**依据用 `getBBox()`**（等于 viewBox 就是没裁），
   以及逐元素最大底边（比总 bbox 精确）。

## 预防

- 作者说「看不全」时先分清**三处不同的空白**，混为一谈会查错方向：
  - **svg 自身**（通常为 0，`getBBox` 可证）
  - **画布内的图例预留**（约 12%，本 tip 讲的，改不掉）
  - **iframe 内 svg 下方**（框开太高）
- `visual-check` 的 `viewer/viewport-overflow` 在宽高比小的图上**必 fail**：
  viewer 让 svg `width:100%` 且无高度上限，所以「画布更满」与「viewer 首屏不滚动」
  在数学上互斥。若用 `?embed=1` 嵌入，这个 fail 不是阻塞项（实测嵌入侧溢出为 0）。
