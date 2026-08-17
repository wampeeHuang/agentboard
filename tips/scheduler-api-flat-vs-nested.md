# Scheduler API GET返回嵌套PUT要扁平

type: tip
date: 2026-07-25
source: 求职巡检cron job方向切换，直接PUT GET结果报"缺少必填字段: output_kind"

## 现象

```bash
curl http://localhost:3100/api/cron/jobs/:id  # 拿到 job
# 改 prompt 后直接 PUT 回去
curl -X PUT http://localhost:3100/api/cron/jobs/:id -d @body.json
# → 422: "缺少必填字段: output_kind"
```

## 根因

jobs.json 存 nested 格式，GET 直接返回 nested。但 PUT 走 `validateJob()` → 预期 flat 格式。两个格式字段名不同：

| nested (GET返回) | flat (PUT/POST要求) |
|------------------|---------------------|
| `output.kind` | `output_kind` |
| `output.path` | `output_path` |
| `schedule.expr` | `cron_expr` |
| `payload.kind` | `executor` |
| `payload.model` | `model` |
| `payload.message` | `prompt` |
| `payload.timeoutSeconds` | `timeout_sec` |
| `agentId` | `agent_id` |

## 修复

GET拿到job后，手动扁平化再PUT：

```js
const flat = {
  name: job.name,
  cron_expr: job.cron_expr,
  executor: job.executor,
  model: job.model,
  agent_id: job.agentId,
  timeout_sec: job.timeoutSeconds,
  category: job.category,
  project_id: job.project_id,
  output_kind: job.output.kind,
  output_path: job.output.path,
  prompt: job.prompt,
  description: job.description,
  enabled: job.enabled
};
fetch(url, { method: 'PUT', body: JSON.stringify(flat) });
```

## 预防

- 改 cron job 优先用 CLI: `node ~/.scheduler/cli.js update <id> --prompt "..."` - CLI 内部自动处理格式转换
- 如果 prompt 太长CLI转义困难，直接用 API + 手动扁平化
- 完整映射表见 `~/.scheduler/CLAUDE.md` § REST API 字段映射
