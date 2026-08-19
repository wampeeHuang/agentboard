---
type: diagnosis
date: 2026-08-18
source: 黄皮油柑海边日落源图，用户只留一张对的图
---

# git 里 deleted+modified 并存，先问意图不默认 restore

## 现象
git status 显示图片 `海边日落.png modified`（尺寸变小）+ `海边日落1.png deleted`，第一反应当数据损坏要 restore。

## 根因
AI 默认把 deleted 解读为"意外丢失/损坏 → 要恢复"，但用户可能是故意的"替换 + 删冗余变体"。二进制文件尤其如此——用户常"只留一张对的图"。

## 修复/步骤
restore 前先判断是替换还是误删：
- 看是否同名变体并存（`X.png` vs `X1.png`）——变体并存 + 尺寸变化 = 大概率替换，不是损坏
- 用 `git diff` 看内容，或直接问用户意图，确认"故意删除"再放行

## 预防
git 里 deleted + 同主题 modified 并存（尤其图片/二进制），默认先问意图，不默认 restore。restore 是红线操作，覆盖用户意图不可逆。
