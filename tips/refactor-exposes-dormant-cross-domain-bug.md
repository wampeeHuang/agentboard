---
type: diagnosis
date: 2026-07-28
source: catalog 字号迁移 CSS 变量后，位置筛选 pill 全部失活。根因在 JS syncPills() 选择器，不在 CSS
---

# 跨域重构暴露休眠 JS 选择器 bug

## 现象
CSS 字号 token 化重构完成后，位置筛选 pill（全部位置/工作区/实验区）全部显示为非激活态，点击无反应。状态筛选不受影响。

## 根因
`syncPills()` 用 `.filter-pill` 选择器遍历所有 pill，对每个取 `b.dataset.status` 判断激活态。位置 pill 用 `data-loc` 而非 `data-status`，`s=undefined`，`s !== "all"` 为 true 且 `activeFilters.has(undefined)` 为 false，`classList.toggle("active", false)` 强置失活。

这是早已存在的休眠 bug——之前也误伤位置 pill，但旧版 CSS 下 pill 激活/非激活视觉差异小，没被发现。CSS token 化把 `active` 样式从同色系微调变成黑白强对比，bug 立即可见。

诊断签名：**改 A 域、坏 B 域、B 域代码没被改** → B 域对共享元素有隐式假设。

## 修复/步骤
```js
// Before: 选中所有 .filter-pill 包括位置 pill（无 data-status）
document.querySelectorAll(".filter-pill")

// After: 只选有 data-status 属性的状态 pill
document.querySelectorAll(".filter-pill[data-status]")
```

## 预防
- 重构前跑一遍所有 `querySelectorAll` 调用，检查选择器是否依赖了即将被改的元素类型
- 用属性选择器 `[data-status]` 代替裸类名，让选择器自带"我只管这一种"的语义
- 任何 DOM 操作如果取 `dataset.x`，必须有属性存在性守卫：`if (s === undefined) return`
