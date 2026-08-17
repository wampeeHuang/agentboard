# CSS ::after 工具提示被父元素遮挡

type: tip
date: 2026-07-22
source: pm-toolkit dashboard 工具提示迭代

## 现象

纯 CSS 工具提示（`.tip::after`，`position: absolute; z-index: 200`），鼠标悬停时提示框被同级的卡片/文字/其他元素遮挡，z-index 再大也无效。

## 根因

CSS `::after` 伪元素的 `position: absolute` 是相对于父 `.tip` 元素的。父元素在 DOM 流中，其层叠上下文受祖先、兄弟元素约束。伪元素虽然设了高 `z-index`，但它只在父元素的层叠上下文中生效——无法跨出父级容器覆盖兄弟元素。

简言之：`z-index: 200` on a pseudo-element is trapped inside the parent's stacking context.

## 修复

不用 CSS 伪元素做工具提示。用 JS 在 `document.body` 末尾动态渲染一个 `position: fixed` 的浮层：

```html
<div id="tooltip-portal" style="position:fixed;z-index:99999;..."></div>
```

```js
document.querySelectorAll('.tip').forEach(function(el) {
  el.addEventListener('mouseenter', function() {
    var rect = el.getBoundingClientRect();
    portal.style.left = rect.left + 'px';
    portal.style.top = (rect.bottom + 8) + 'px';
    portal.textContent = el.getAttribute('data-tip');
    portal.classList.add('show');
  });
  el.addEventListener('mouseleave', function() {
    portal.classList.remove('show');
  });
});
```

关键点：
- `position: fixed` — 相对于视口定位，不参与父级层叠上下文
- 挂 `document.body` 直接子节点 — DOM 树最深层的兄弟，天然在顶层
- `z-index: 99999` — 保险
- `pointer-events: none` — 提示不阻挡鼠标事件

## 预防

任何需要在多层卡片/DOM 结构中弹出的浮层（tooltip/dropdown/popover），不要用 CSS 伪元素或绝对定位。走 body-level portal 模式：

1. CSS 定义一个 `#xyz-portal`，`position: fixed; z-index: 99999`
2. JS 控制显隐和位置
3. `document.body.appendChild` 或内联 `<div id="xyz-portal">`
