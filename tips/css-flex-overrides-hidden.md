---
type: diagnosis
date: 2026-08-06
source: source-rack 图谱视图开发
---

# CSS flex/grid 覆盖 [hidden] 属性

## 现象
- 带 `hidden` 属性的元素仍然可见
- 列表模式空白，另一个视图漏到当前页

## 根因
浏览器默认 `[hidden] { display: none }` 的优先级低于任何显式 `display` 声明。
当 CSS 写了 `.container { display: flex }`，`hidden` 属性失效。

## 修复
```css
.container { display: flex; }
.container[hidden] { display: none !important; }
```

## 预防
给任何带 `hidden` 属性的容器写 `display` 时，顺手加一行 `[hidden]` 回退。
不限于 flex — grid、block、inline-block 全部适用。
