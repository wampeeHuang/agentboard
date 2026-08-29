---
type: diagnosis
date: 2026-08-25
source: layout-gallery grow.html——padding 用了不存在的 --space-96，间距几轮没生效
---

# CSS var() 引用不存在的 token → 整条声明静默作废

## 现象

CSS 声明里写了 `padding: var(--space-64) var(--space-24) var(--space-96);`，但 --space-96 在 token 清单里不存在。元素 padding 全部为 0，间距"没生效"，浏览器不报错，改了好几轮才定位。

## 根因

CSS 规范：var() 引用未定义变量时，包含它的**整条声明**在 computed-value 阶段被判为 invalid，被浏览器静默丢弃。不是只丢那一个值——是 padding 整个失效（回到初始值 0 / auto）。

## 步骤

1. 元素布局异常但规则"明明写了" → devtools 看该元素 computed style，padding 显示 0/auto 而非设定值
2. 查声明里每个 var(--x) 的 token 是否在 tokens.json 存在（grep token 清单）
3. 不存在 → 换成存在的 token，或补 token

## 预防

- 写 var() 前先核对 token 清单，不凭记忆
- 页面代码加契约校验：grep 页面里的 var(--xxx)，与 token 清单 diff，防混入不存在 token
