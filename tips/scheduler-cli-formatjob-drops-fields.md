---
type: diagnosis
date: 2026-07-31
source: cron 模型迁移 — CLI update 十个作业八个失败，改完一个 422 又来一个
---

# 手动字段映射必定漏字段 — scheduler CLI formatJob 丢了 prompt

## 现象

`cli.js update <id> --model deepseek-v4-flash` → 422 "Agent 任务缺少必填字段: prompt"。
所有 agent 作业都报同样错误。直接 curl API 构造完整 body → 成功。

## 根因

`cli.js` 的 `formatJob()` 函数手动维护 nested→flat 字段映射表。只映射了 12 个字段：

```javascript
// 映射了: name, cron_expr, executor, model, agent_id, timeout_sec,
//         output_kind, output_path, category, project_id, description, enabled
// 漏掉了: prompt（agent 必填！）
```

agent 任务的 prompt 存在 `payload.message`，`formatJob` 没提取，PUT body 缺 prompt → API 422。

更深层根因：字段映射应该从 `task-schema.json` 的 fields 定义自动派生，不是手工维护两份列表。`task-schema.json` 是唯一真相源，`formatJob` 是它的影子副本——影子必然漂移。

## 修复

```javascript
// formatJob 加一行
prompt: j.payload ? (j.payload.message || '') : (j.prompt || ''),
```

## 预防

`formatJob` 改为读 `task-schema.json` 的 `fields` 数组自动生成映射表。每个 field 声明 `mapsFrom`（nested 路径）和 `mapsTo`（flat 字段名），`formatJob` 遍历 fields 自动搬运。新增字段只改 schema，映射自动生效。
