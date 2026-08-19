---
type: diagnosis
date: 2026-08-06
source: source-rack 力导向图谱点击节点无响应
---

# rAF + innerHTML 导致 click 事件丢失

## 现象
- 高频渲染的元素（canvas/SVG）点击无响应
- 事件委托 handler 不触发
- 偶尔能点中（快速点击时）

## 根因
`requestAnimationFrame` 每帧 (~16ms) 调 `innerHTML` 重写所有子元素。
用户在元素上 mousedown → 下一帧 innerHTML 销毁该元素 → mouseup 时 click target 是幸存祖先而非原元素 → 事件委托的 `closest('[data-action]')` 找不到目标。

## 修复
**廉价修复**: mousedown 阶段捕获意图数据，mouseup 检查位移判断 click vs drag：
```js
var clickInfo = null;
el.addEventListener('mousedown', function(e) {
  var target = e.target.closest('[data-action]');
  if (target) clickInfo = { action: target.dataset.action, value: target.dataset.value, x: e.clientX, y: e.clientY };
});
document.addEventListener('mouseup', function() {
  if (clickInfo && Math.abs(clickInfo.x - lastX) < 3) handleAction(clickInfo);
  clickInfo = null;
});
```

**正确修复**: 用 `setAttribute` 更新属性替代 `innerHTML` 重建整个子树。

## 预防
高频渲染场景（游戏循环、力导向、实时数据流）不用 `innerHTML`。先建 DOM，后改属性。
