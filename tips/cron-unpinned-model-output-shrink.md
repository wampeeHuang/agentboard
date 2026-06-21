# cron job 不指定模型时 Agent 随机选模型，flash 产出比 pro 缩水 40-60%
type: diagnosis
date: 2026-06-15
source: 排查 data.evopearl.com 每日选题内容异常简短

## 现象

evopearl-data 三个 cron job（深读/信号/选题）的 JSON 产出文件大小持续下降：
- ai-signal: 5657 → 3323 bytes（-41%）
- daily-selection: 7945 → 5745 bytes（-28%）
- deep-read: 14200 → 9843 bytes（-31%）

summary 字段从 80-150 字带结构化标记，退化到 40-80 字一句话。

## 根因

cron job 的 `jobs.json` payload 里没有 `model` 字段。Agent 每次自选模型，时而 `deepseek-v4-pro`，时而 `deepseek/deepseek-v4-flash`。

v4-flash 是速度优化版，summary 输出只有 v4-pro 的 40-60%，且忽略 prompt 中的格式化指令（如六个 emoji 标记）。模型波动导致产出质量不稳定——前一天正常，后一天缩水，再一天又恢复。

## 修复

在 `~/.openclaw/cron/jobs.json` 每个 evopearl job 的 payload 里加 `"model": "deepseek-v4-pro"`，放在 `"kind": "agentTurn"` 下一行：

```json
"payload": {
  "kind": "agentTurn",
  "model": "deepseek-v4-pro",
  "message": "...",
  "timeoutSeconds": 900
}
```

受影响的三个 job：3cfba668（深读）、591346bc（信号）、a85e2d4c（选题）。

## 预防

- 任何需要稳定输出质量的 cron job，必须显式指定 model，不依赖 Agent 默认选择
- 如果以后换模型（如 v4 退役），三个 job 同步更新，保证一致性
