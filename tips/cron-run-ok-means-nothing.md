# CLI `openclaw cron run` 返回 ok+jobs 不代表成功
type: diagnosis
date: 2026-06-13
source: cron 调度器架构改造，A/B 测试 CLI vs MCP 触发通道

## 现象
`openclaw cron run <id>` 永远返回 `{ok: true, enqueued: true}`，exit code 0，即使 job 实际上因为欠费、超时、网络错误失败。

## 根因
`cron run` 只负责把任务放入网关队列，不等待执行结果。它是 fire-and-forget 语义，但返回的 `{ok: true}` 强烈暗示"执行成功"。

## 修复
触发后轮询 `openclaw cron runs --id <id> --limit 1`，解析 JSON 获取真实状态：

- `entry.status === 'ok'` → 真正成功
- `entry.error` 含 `billing|credits|insufficient balance` → 欠费，当天停止
- `durationMs < 5000` + status=error → 通常是网络/API 错误
- 同时拿到 `durationMs` 和 `usage.total_tokens`，不需要额外计算

匹配本次运行用 `entry.runAtMs >= triggerTime - 5000`（5 秒容差）。

## 预防
任何异步 enqueue 式 CLI 命令不能单看 exit code/ok 字段判成败。必须找到对应的状态查询命令，触发后轮询拿到真实结果再分类处理。
