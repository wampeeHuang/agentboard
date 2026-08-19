---
type: diagnosis
date: 2026-07-16
source: data.evopearl.com AI信号 cron 7:30 触发但 agent zero-output 卡死
---

# Scheduler `_runningSince` 粘连 — agent 卡死后 cron 永久不重试

## 现象

- 调度器事件日志有 `job_triggered` 但无对应 `job_completed`
- `scheduler-state.json` 里 `_runningSince` 一直设着（数小时不消）
- 当天不再有任何重试，job 整天"假成功"（上次成功状态未更新）
- agent 进程存在但几乎 0 CPU/0 内存增量

## 根因

调度器 stale-run 清理逻辑（超过 600s 清 `_runningSince`）写在 `triggerJob()` 函数内，不在主 tick 循环中。

```
triggerJob() → 检查 _runningSince → 超过 600s → 清 → 继续执行
```

但对于 cron 每天只匹配一次的 job（如 7:30 触发），tick 循环在 7:31 之后不会再进入 `triggerJob()` → stale 检查永远不会执行 → `_runningSince` 永久粘连。

## 修复

### 紧急手动修复
1. 读 `scheduler-state.json`，找到对应 job 的 `tasks.<id>._runningSince`
2. 手动设 `_runningSince: null`
3. `POST /api/cron/jobs/:id/run` 重触发

### 架构修复
在 tick 循环中加独立 stale-run 扫描（不依赖 cron 匹配），或把 `_runningSince` 清理逻辑从 `triggerJob()` 提到 tick 主循环。

## 预防

- agent executor (runner.js) 加心跳超时：agent 进程 N 分钟无 stdout → kill + 标记 failed
- tick 循环加 `clearStaleRunningSince()` 独立扫描
