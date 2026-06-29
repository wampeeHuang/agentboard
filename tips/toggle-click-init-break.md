# 程序化 .click() 触发 toggle handler 状态反转

type: diagnosis
date: 2026-06-29
source: scheduler dashboard Step 3 重构 — 日历自动展开逻辑失效

## 现象

`initState()` 从 localStorage 恢复 `state.calendar.open = true`，然后调用 `btn-cal.click()` 触发日历展开。但日历永远不展开。

## 根因

`.click()` 触发的是 toggle handler，内部写的是 `state.calendar.open = !state.calendar.open`。handler 默认 state 初始值是 `false`，所以 `!false → true` 展开。但初始化时 state 已经被恢复为 `true`，`.click()` → `!true → false`，展开被抵消。

程序化 `.click()` 和用户点击共享同一 handler，语义不同但无法区分。

## 修复

不修日历展开（低优先级已知 bug）。通用修复模式：

```
// ❌ 共用 toggle handler
btn.onclick = () => { state.open = !state.open; apply(); };
if (state.open) btn.click(); // 反转了！

// ✅ 分离 setter 和 toggle
function applyOpen(v) { state.open = v; /* DOM update */ apply(); }
btn.onclick = () => applyOpen(!state.open);
if (state.open) applyOpen(true); // 直接设状态，不走反转
```

核心原则：**状态初始化用 setter（设绝对值），用户交互用 toggle（算翻转）。两者不走同一入口。**

## 预防

见到 `.click()` 出现在初始化/恢复代码中 → 立即检查 handler 是否做了 `!state.x` 翻转。是 → 抽 setter。
