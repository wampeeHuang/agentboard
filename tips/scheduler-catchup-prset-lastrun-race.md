# Catch-up 提前设 lastRun 导致 triggerJob 日成功守卫跳过执行

type: diagnosis
date: 2026-07-09
source: data.evopearl.com AI 信号 cron 7:30 错过 → catch-up 触发但实际未执行 → 网站无当日内容

## 现象

Cron job 在关机时错过，开机后 catch-up 路径触发。调度器状态显示 `lastRun` 已更新为当天、`lastStatus: success`，但实际产出文件不存在。Pass 1 精确命中的后续 job 正常，只有 catch-up 触发的 job 受影响。

## 根因

`scheduler.js` catch-up 路径（约第 803 行）在调用 `triggerJob()` **之前**设置 `ts.lastRun = now`。triggerJob 内部有日成功守卫（约第 441-446 行）：

```javascript
if (!force && ts.lastStatus === 'success' && ts.lastRun) {
    var lastRunDate = localDate(new Date(ts.lastRun));
    if (lastRunDate === localDate()) {
        console.log('Skip: (already succeeded today)');
        return;  // ← 被这里拦截，实际没执行
    }
}
```

闭机前 lastStatus = 'success'（昨天的成功状态），catch-up 提前设 lastRun = 今天 → 守卫判断"今天已成功" → 跳过。

时序：catch-up 设 `lastRun` 是为了防止同一 tick 内重复调度，但这与 triggerJob 的守卫产生了竞态。triggerJob 本身在 460 行也设 `lastRun`，catch-up 的预置是冗余的。

## 修复

1. 移除 catch-up 块中的 `ts.lastRun = now.toISOString()`
2. 将 `ts._catchupAt = null` 改为 `ts._catchupAt = new Date(now.getTime() + 3600000).toISOString()`——延长 1 小时防重复 catch-up，triggerJob 自身会在执行后清掉
3. 补充 agent 成功分支缺失的 `state.tasks[job.id] = ts; saveState()`（失败分支和 shell 分支都有，仅 success 分支遗漏）

修复位置：`scheduler.js` catch-up 块（约 798-808 行）和 triggerJob agent 成功分支末尾。

## 预防

- catch-up 路径只负责防重复调度，不预置业务状态字段
- 任何"回调前设状态标记"的模式都要检查回调内部是否有基于该标记的守卫
- 调度器的 `lastRun` / `_runningSince` / `_catchupAt` 三字段各自职责独立，不互相替代
