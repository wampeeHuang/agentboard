# Shell job 缺少 agent job 同等的质量门禁

type: diagnosis
date: 2026-08-04
source: 猫波译站重复视频——sync-catwave.ps1 无跨日去重，ai-signal/deep-read 的 prompt 有 Gate 0.5 去重

## 现象

同一管道内的不同步骤，数据质量不一致。agent 执行的步骤（ai-signal、deep-read）无重复，shell 脚本执行的步骤（catwave sync）大量重复。用户发现同一条视频连续出现在 6 天的榜单中。

## 根因

质量门禁不是框架强制，而是人工在写 prompt/脚本时逐一手动加的：

- ai-signal prompt → Gate 0.5 跨日去重（人工写到 prompt 模板里）
- deep-read prompt → Gate 0.5 跨日去重（同上）
- catwave sync → PowerShell 脚本，零质量门禁（写脚本时根本不会想到"同管道的其他步骤有去重逻辑"）

agent prompt 和 shell 脚本是两条平行路径，没有共享的 gate 注册表。每加一个新步骤，门禁靠人脑记忆——必然遗漏。

## 修复

sync-catwave.ps1 加入 30 天跨日去重：加载前 30 天已生成 JSON → 提取 slug 集合 → 当前批次过滤 → 取 top 5。

## 预防

1. **新增 shell job 到已有管道时**，逐一比对同管道 agent job 的 gate 清单（去重、格式校验、敏感词、来源验证），确认 shell 脚本覆盖了等效检查
2. **不是复制 prompt 里的 gate 文字到脚本**——是理解每个 gate 防护什么风险，在脚本里用代码实现
3. **如果管道有 ≥3 个步骤，考虑建一个 gate-checklist.md** 放在管道项目里，每步启动前逐项打勾。不靠人脑记忆
