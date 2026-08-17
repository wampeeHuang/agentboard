# 调度器 REST API PUT 要求全字段，不支持 partial update

type: pitfall
date: 2026-07-30
source: evopearl-data v2 迭代 — 改 job cron 时间和名称

## 现象

只想改 cron_expr 和 name，发送 partial JSON：

```bash
curl -X PUT "http://localhost:3100/api/cron/jobs/{id}" \
  -H "Content-Type: application/json" \
  -d '{"cron_expr":"0 8 * * *","name":"新名称"}'
```

返回 422:
```json
{"error":"Validation failed","details":[
  "Agent 任务缺少必填字段: prompt (提示词)",
  "Agent 任务缺少必填字段: model",
  "缺少必填字段: output_kind"
]}
```

## 根因

API 验证 `task-schema.json` 的 required 字段，agent 类型任务 name/prompt/model/output_kind 全部 required。PUT 不是 partial update——它走完整验证链路。

## 修复

**正常流程**: 先 GET 完整 job → 修改目标字段 → PUT 完整 body

**紧急快速**: node 直接编辑 `~/.scheduler/jobs.json`（绕过验证，但这是设计上不被鼓励的操作——CLAUDE.md 有红线）

```javascript
const fs = require('fs');
const jobsPath = require('os').homedir() + '/.scheduler/jobs.json';
const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'));
const job = jobs.jobs.find(j => j.id === 'xxx');
job.name = '新名称';
job.schedule.expr = '0 8 * * *';
fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2), 'utf-8');
// 然后重启 scheduler 加载新配置
```

## 预防

- 调度器 dashboard 的编辑表单（`/cron` 页面）支持 partial edit，走 UI 比 curl 安全
- 如果经常需要命令行改单个字段，考虑给 CLI 加 `--partial` flag
