---
type: fact
date: 2026-07-17
source: 音乐作坊 SO-0003 生成，选 Female 但始终出男声
---

# ACE Step 风格 Prompt 覆盖人声性别下拉框

## 现象
ACE Step 界面人声性别选 Female，但生成出来的歌永远是男声。反复生成不改变。

## 根因
ACE Step 的风格 Prompt 文字描述权重高于性别下拉框。Prompt 里写了 "male vocalist, male vocal" → 引擎优先遵循文字描述 → 忽略 UI 下拉框设置。

## 修复
生成前检查风格 Prompt 文本，确认没有性别关键词（male/female/man/woman/男/女）与目标性别冲突。冲突时优先改 Prompt。

## 预防
- 外部 AI 提示词模板里加约束："只输出音乐风格描述，不要指定歌手性别"
- 每次生成前扫描风格 Prompt 字段里的性别关键词
