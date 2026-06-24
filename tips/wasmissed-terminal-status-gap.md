# 调度器 wasMissed 不认新终点状态导致 catch-up 重试风暴
type: diagnosis
date: 2026-06-23
source: 两层质量门禁实现后验证，loop-engine自检 output_missing 被 wasMissed 无限重触发

## 现象

loop-engine自检 job 手动触发后，runtime-events.jsonl 在 4 分钟内出现 16 条 `job_triggered`，同时有多条并发 Claude 进程在跑。预期只应有 1 次触发。

## 根因

`wasMissed()` 的短路条件只认 `lastStatus === 'success'` 为终点状态：

```javascript
// 旧代码
if (ts.lastRun && ts.lastRun.slice(0, 10) === today && ts.lastStatus === 'success') return false;
```

新增的 `output_missing`（产出验证失败）和 `fatal_error`（欠费/认证错误）不在短路条件中。tick() 每分钟运行一次，catch-up pass 看到 `lastStatus !== 'success'` → 认为 job 还没执行成功 → 再次 `triggerJob()`。

每次 trigger 启动一个 Claude 进程（耗时 2+ 分钟），在下一次 tick 之前来不及完成 → 下次 tick 再触发 → 并发积累。

## 修复

```javascript
// 新代码 — 所有非瞬态终点状态都短路
if (ts.lastRun && ts.lastRun.slice(0, 10) === today) {
  if (ts.lastStatus === 'success' || ts.lastStatus === 'output_missing' || ts.lastStatus === 'fatal_error') return false;
}
```

同时 `tick()` 开头加 `saveState()` 在 `loadState()` 之前，防止内存中 triggerJob 写入的 `_runningSince` 被磁盘旧状态覆盖。

## 2026-06-24 追加：两个新边界导致修复后仍重触发

### 边界 1：catch-up 保存状态不含 lastRun

旧 catch-up 只保存 lastTickMinute/lastTickHour，不设 lastRun。triggerJob 内部虽然设了 lastRun（line 259），但 saveState 在异步 .then() 回调中（line 314/358/416）。两个 tick 之间（TICK_MS=60s），状态文件仍是昨天的 lastRun → 下一个 tick 的 wasMissed 跳过"今天日期+终端状态"的短路检查 → 再次触发。

修复：catch-up 行 `pick.ts.lastRun = now.toISOString()` 在 saveState 之前。

### 边界 2：AgentTurn 异步窗口

AgentTurn 模式运行数分钟。即使 catch-up 设了 lastRun，下一个 tick 的 wasMissed 会看到今天 lastRun → 进入日期块 → 但不匹配 terminal_status（job 还在跑，lastStatus 未更新）→ 检查时间 → 通过 → 再次触发。

修复：wasMissed 日期块内加时间门禁：
```javascript
if ((now - new Date(ts.lastRun)) < TICK_MS * 2) return false;
```
TICK_MS*2=120 秒内不重复 catch-up。

### 副作用：进程崩溃状态丢失

旧调度器崩溃时状态文件可能是空 JSON 或过期 → 新调度器 loadState → 空 tasks → 所有 job 的 wasMissed 返回 true → catch-up 全触发一遍。正常：只触发 earliest missed，然后 lastRun 写入 + 时间门禁阻止循环。

### 多调度器并存

`Start-Process` 多次调用可能启动多个调度器实例（共享同一 port 3100 启动失败 → 但后启动的会失败）。重启前必须先确认旧进程已死。

## 预防

- 任何新增的非瞬态终点状态（今天已经跑过、重试不会改变结果），必须同步更新 `wasMissed()` 的短路条件
- 调度器状态机的终点状态应与 catch-up guard 保持一一对应
- **catch-up saveState 必须含 lastRun**，确保下次 tick 能看到"今天已尝试"
- **异步执行 + 周期性 tick 的系统中，必须加时间门禁**防止执行中和状态保存之间的窗口
- 检验方法：触发一个 output_missing 的 job → 等 2 分钟 → grep runtime-events.jsonl 不应出现同 job 的第二次 trigger
