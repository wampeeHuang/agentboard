---
type: diagnosis
date: 2026-08-22
source: grid-ruler 书签开关失效——每次点击运行全新闭包，toggle 状态不跨次存活
---

# Bookmarklet 每次点击 = 全新执行，闭包状态不跨次存活

## 现象

书签脚本写成 `overlay ? disable() : enable()`（闭包变量存开关状态）：第一次点击开网格正常，第二次点击**不关反而再开一次**，永远关不掉。或写 `function disable() { if (overlay) overlay.remove() }`：第二次点击什么也不做。

## 根因

bookmarklet 每次点击都把整段 JS **重新执行一遍**，每次都是全新的作用域闭包，`let overlay = null` 每次重置。用闭包变量判断/执行开关，第二次点击拿到的永远是初始值 → 永远走 enable()，或 disable() 因为变量为 null 而空转。

## 修复

开关决策和资源清理全部基于 DOM 存在性，不基于闭包变量：

```js
document.getElementById(OVERLAY_ID) ? disable() : enable();

function disable() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
  // 其余元素同理用 getElementById 查
}
```

## 预防

- 凡是"点书签开关"类脚本，状态一律以 DOM 为准（元素在不在），不依赖每次执行才创建的变量。
- resize 等监听器若跨多次执行累积，用 DOM 门禁（先查元素存在）保证空转无害。
- 重构共享脚本（同时服务扩展 content script + 书签）时，两种运行形态各测一遍——扩展上下文闭包常驻，书签上下文每次重建，行为可能不同。
