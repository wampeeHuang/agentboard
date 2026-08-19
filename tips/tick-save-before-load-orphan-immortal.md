---
type: diagnosis
date: 2026-07-14
source: scheduler no_foreign_tasks 巡检 FAIL——短 UUID `3cfba668` 从 scheduler-state.json 反复删除反复重生
---

# tick() 先 saveState 再 loadState，内存孤儿条目永生不死

## 现象
- 手动从 JSON state 文件删除某个条目 → 60 秒内条目精确复原
- 条目内容一模一样（包括 `lastRun` 时间戳），不是重新创建，是原样写回
- 停进程 → 删文件 → 启动 → 条目消失。但运行中删文件永远无效

## 根因
tick() 循环的 save/load 顺序：

```js
function tick() {
  saveState();   // ① 先把内存 state 写回磁盘 ← 包含孤儿条目！
  loadState();   // ② 再从磁盘读回 ← 读到的就是刚写回去的（含孤儿）
  var jobs = loadEnabledJobs();  // ③ 只给已注册 job 建条目，不清理不在 jobs.json 里的
  ...
}
```

`loadEnabledJobs()` 只负责"确保注册 job 有对应 state 条目"，不负责"删除未注册 job 的条目"。孤儿一旦进入内存 state（比如通过旧版本的 reset API），就会在 ① 被同步回磁盘，② 再读回来——永动循环。

**为什么旧条目能进内存**：`start()` 时 `loadState()` 从磁盘加载了历史遗留的孤儿条目，之后 tick() 每次先写回再读取，内存版本永远是赢家。

## 修复
在 `loadEnabledJobs()` 开头加孤儿清理：

```js
var validIds = {};
all.forEach(function(j) { validIds[j.id] = true; });
Object.keys(state.tasks).forEach(function(id) {
  if (!validIds[id]) delete state.tasks[id];
});
```

每次 tick 都会执行，新产生的孤儿活不过 60 秒。

## 预防
- tick 循环优先 `loadState()` → 处理 → `saveState()`，而不是反过来
- 如果必须先 save 再 load（为了 flush 未完成的修改），确保 load 后有清理逻辑
- state 管理函数遵循 CRUD 完备性：有 add 就有 remove，有 create 就有 cleanup
- 手动编辑 state 文件前必须先停进程——内存 > 磁盘
