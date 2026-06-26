# HANDOFF 2026-06-26 (会话2)

## 本次完成
- 智谱 Coding Plan 接入完成，双轨道可用：
  - OpenClaw provider `bigmodel`（glm-5.2 / glm-5v-turbo）
  - agentboard 工具卡片 `bigmodel-coding-plan`（编号 #35）
- agentboard CLAUDE.md 新增 §模型路由——代码/Agent/截图→前端任务自动查工具架匹配模型

## 国产模型选型结论
- DeepSeek V4 Pro → 主力不动（cron巡检、结构化Agent）
- GLM-5.2 → Coding/长程Agent任务专用
- GLM-5V-Turbo → 截图→前端代码（Design2Code 94.8）
- Qwen3.7-Max → Agent长程自治备选（35h连续），暂未接入

## 关键文件
| 文件 | 改动 |
|------|------|
| `~/.agentboard/tools/bigmodel-coding-plan/manifest.json` | 新增 |
| `~/.agentboard/CLAUDE.md` | 追加§模型路由 |
| `~/.openclaw/openclaw.json` | 追加 bigmodel provider + GLM-5.2/GLM-5V aliases |
| `~/.claude/.../memory/reference_zhipu_coding_plan.md` | 新增（API key & 调用方式） |

## 未做
- CCwitch 模型切换面板（方案讨论过，OpenClaw 够用，没动手）
- Qwen3.7-Max 接入（用户只买了智谱 Coding Plan）
- GLM-5.2 按量 ¥8/28 百万token，套餐散户买不到
