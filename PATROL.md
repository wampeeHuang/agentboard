# 定期巡检标准

设置或维护巡检时读本文件。先读 `CHECKLIST.md`。

## 判定：什么工具需要巡检？

三步：

1. **外部依赖？** — 数据来自外部（政策/价格/公告），非自包含
2. **会过时？** — 信息源会更新，数据停滞=工具失效
3. **过时代价 > 0？** — 错过截止/算错金额/错误决策

正例：税无忧（税率变）、深圳住房（公告更新）、个体户台账（政策调）
反例：Ollama（模型自包含）、ComfyUI（工作流自包含）

## patrol.json

放在工具项目目录，与 `data.json` 同级：

```json
{
  "enabled": true,
  "cron": "7 9 * * 1",
  "agent": "claude-code",
  "dataFile": "data.json",
  "dataKey": "_巡检信息源",
  "lastRun": "2026-06-01T09:07:00+08:00",
  "runHistory": [],
  "prompt": "自包含巡检指令：查什么、搜什么、更新什么。任何 agent 能独立执行。"
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `enabled` | 是 | agentboard 可一键关停 |
| `cron` | 是 | 五字段标准 cron |
| `agent` | 是 | 当前执行者。换 agent 只改此字段 |
| `dataFile` | 是 | 巡检更新的数据文件 |
| `dataKey` | 是 | 数据文件中巡检的 JSON key |
| `lastRun` | 是 | ISO 时间戳 |
| `runHistory` | 是 | `[{time, agent, result, summary}]`，保留最近 10 条 |
| `prompt` | 是 | **自包含，agent 无关。** 不写 Claude Code 特定语法，用通用工具名 |

### 频率选择

| 变化速度 | 过时代价 | 频率 | 示例 |
|---------|---------|------|------|
| 日级 | 高 | 每日 | 市场信号 |
| 周级 | 高 | 每周 | 政府公告/税务政策 |
| 月级 | 中 | 每月 | 社保基数 |
| 季级 | 低 | 每季/手动 | 行业报告 |

公式：巡查频率 = 信息变化速度 × 错过代价 / 单次巡查成本

## agent 插拔

- patrol.json 是真相源，agent 是执行器
- 任何 agent 读到 patrol.json 应能独立执行，不依赖前任状态
- 换 agent：改 `agent` 字段 + 新 agent 注册自己的调度器
- `prompt` 用通用工具名（web_fetch/web_search），不用 agent 特定语法

## manifest 标记

工具需要巡检时加一行：

```json
"patrol": true
```

agentboard 检测后在工具卡片显示巡查状态。
