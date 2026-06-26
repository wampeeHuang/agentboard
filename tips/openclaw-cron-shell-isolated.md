# OpenClaw cron: shell job 静默 skipped

type: cron
date: 2026-06-26
source: localhost:3100/cron 显示4个异常

## 现象
- cron job 的 `lastStatus: "skipped"`，实际从未执行
- 错误信息: `isolated job requires payload.kind=agentTurn`
- 所有 `payload.kind: "shell"` 的 job 全部挂掉，包括没有显式设置 `sessionTarget` 的
- gateway 升级后出现（之前 shell job 正常运行）

## 根因
Gateway 将所有 cron job 默认跑在 isolated session，但 isolated session 只接受 `payload.kind=agentTurn`，不接受 `shell`。

## 修复
1. 将 `payload.kind` 从 `"shell"` 改为 `"agentTurn"`
2. 把原 shell 命令包在 `message` 字段里让 agent 执行
3. 确认 job 有 `sessionTarget: "isolated"`（没有的补上，否则 gateway 内部报 `Cannot read properties of undefined (reading 'startsWith')`）
4. 用 `cron.update` JSON-RPC 直接调，参数格式: `{id, patch: {payload: {...}}}`（MCP 封装 `openclaw_cron_update` 参数格式不对，会报 schema 错误）

## 预防
- Gateway 升级后先检查 cron 面板是否有 skipped
- 新增 shell 类 job 直接用 agentTurn + message 包命令
