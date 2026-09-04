---
type: diagnosis
domain: general
author: claude
date: 2026-09-04
source: 灵感图库减法 CDP 回归：侧栏/视图按钮偶发为空，误判成回归 bug 浪费多轮
---

# CDP 断言前要等整条数据链就绪，不能只看第一个数据源

## 现象

用 CDP 验证页面时，`ITEMS` 已经非空就立刻断言 DOM，结果侧栏按钮、画板列表偶尔为空、偶发非空，被当成回归 bug 排查了多轮。

## 根因

前端加载是串行链：`fetch('/api/items')` → 赋值 `ITEMS` → `fetch('/api/boards')` → `BOARDS` → 加载 lessons → `refresh()` 渲染侧栏。`waitFor('ITEMS.length>0')` 在链条第一步完成时即放行，此刻 `BOARDS` 还是初始空数组、侧栏根本没渲染；断言于是随微秒级时序时好时坏（探针脚本与真实数据链赛跑）。

## 怎么避免

- 把就绪条件写成**复合谓词**，覆盖整条渲染链：`document.readyState === 'complete' && ITEMS.length > 0 && BOARDS.length > 0 && document.querySelectorAll('#sideNav [data-view]').length >= 5`。
- 对负责渲染的函数先做存在性检查（如 `typeof refresh === 'function'`），必要时再主动调一次并等待副作用完成。
- 断言前先打印数据源长度与关键 DOM 数量作为定位日志，别只输出 PASS/FAIL。
- 禁止用固定 `setTimeout` 代替就绪信号：本地快可能掩盖，慢机器上必炸。
