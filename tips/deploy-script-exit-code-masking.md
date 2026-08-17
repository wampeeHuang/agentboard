# Shell job 用 exit 0 表示"跳过"会静默掩盖故障
type: diagnosis
date: 2026-07-25
source: evopearl-data deploy.ps1 硬编码四模块检查，缺 catwave 时 exit 0 → scheduler 报告 job_completed → 整站空白无人知

## 现象

调度器显示 job_completed（绿色），但实际什么都没部署。数据在仓库里，不在线上。

## 根因

Shell 脚本用 `exit 0` 表示"检测到条件不满足，跳过执行"。调度器只看 exit code，0 = 成功。跳过和成功的语义被压扁成了同一个返回值。

## 修复/步骤

区分三种退出语义，不走同一个 exit code：

| 退出码 | 语义 | 何时用 |
|--------|------|--------|
| 0 | 成功 | 部署完成，线上可验证 |
| 2 | 跳过 | 条件不满足，但非异常（如"今天无需部署"） |
| 1 | 失败 | 真故障，需要告警 |

同时在 stdout 写清楚 `DEPLOY_SKIPPED: reason`，方便日志检索。

## 预防

- 写 shell job 时先列出所有可能的结束状态（成功/跳过/失败/超时），每个配独立 exit code
- 链里的 shell job 优先用 `exit 2` 表示跳过——链机制可以把非零退出码传给下游判断
