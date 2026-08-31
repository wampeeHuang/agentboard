---
type: capability
date: 2026-08-31
domain: general
author: claude
source: OBS 全面汉化验证——Read 显示 [Unsupported Image]，工具架无自家视觉模型
tool: deepseek-vision
scenario: 任何需要看图内容的场景：截图视觉验证、UI 布局检查、截图转代码、OCR、图像理解
---

# DeepSeek 自家视觉模型验证截图（Read 工具看不了图时）

## 能力
Read 工具在本机显示不了图片（当前运行模型非多模态，返回 [Unsupported Image]）时，用 DeepSeek 自家视觉模型 deepseek-v4-flash-vision-exp 验证截图/读图。走 DEEPSEEK_API_KEY 同账户，零额外 key。

## 为什么只能用这个
| 方案 | 为什么不行 |
|------|-----------|
| Read 工具 | 当前模型非多模态，显示 [Unsupported Image] |
| GLM-4.6V (glm-46v-flash) | GLM_API_KEY 本机未配置 |
| MiniCPM-V 本地 | 需启动占 2.5GB 显存，慢 |
| DeepSeek 文本模型 | 不接受图片，返回 400 |

## 速查
```bash
node C:\Users\Administrator\.agentboard\tools\deepseek-vision\vision.js <图片路径> "问题"
```
坑：图只在 user 消息；max_tokens 必须 ≥1500（脚本已内置 2000）；base64 ≤32MiB 先压缩大图。调用细节以 tools/deepseek-vision/manifest.json 的 agent_notes 为准。
