---
type: diagnosis
date: 2026-08-26
source: scheduler 产出类型气泡 tooltip 迭代——气泡想浮在选项上方却跑到 100+px 外
---

# CSS absolute containing block 基准错 → 跨容器定位用 getBoundingClientRect 矩形差

## 现象

自定义下拉的 tooltip 气泡想浮在悬停选项正上方 16px，设置 `bottom: Npx` 后气泡却跑到选项上方 100+px 外，且肉眼感觉"离得太远"。

## 根因

`position: absolute` 的 containing block = **最近的 positioned 祖先**，`top/bottom/left/right` 全按它算。气泡被放在了外层容器 `.ok-sel`（`position: relative`，但高度只等于头部按钮）下，而不是下拉菜单 `.ok-menu` 下。`bottom: Npx` 实际按"头部容器底部"算，而悬停选项在下拉菜单里（远低于头部）——基准差 = 头部高度 + 菜单间隙，于是气泡浮到选项上方百来像素。

DOM 结构看着"气泡在菜单同级"，容易误以为它会相对菜单定位——**定位基准看 positioned 祖先，不看视觉相邻**。

## 修复

跨容器精确间距，用 `getBoundingClientRect` 实测两个真实矩形算差值，不猜 offset：

```js
var selRect = container.getBoundingClientRect();  // 定位基准容器
var optRect = option.getBoundingClientRect();     // 目标元素
bubble.style.bottom = (selRect.bottom - optRect.top + 16) + 'px'; // 16px 间距
```

## 预防

- 写 absolute 浮层前先确认它的 positioned 祖先是谁（元素或最近的 `position: relative/absolute/fixed` 祖先）。
- 想让气泡相对下拉菜单定位 → 把气泡放进菜单内部，或保证菜单是气泡的定位基准。
- 需要"距某元素 N px"这类跨容器精确距离时，`getBoundingClientRect` 两矩形差最稳，别用 offsetTop/offsetParent 心算。
- 若选项高度/间距变化导致偏差，程序验证用 `getBoundingClientRect` 断言实际 gap 值，别只靠肉眼。
