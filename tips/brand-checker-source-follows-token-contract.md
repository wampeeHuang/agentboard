---
type: diagnosis
domain: general
author: claude
date: 2026-09-03
source: Agentboard 审计清零 — 品牌漂移 13 条全量误报，CSS/HTML 颜色全部报 drift
---

# 品牌校验器读残留副本致全量误报：审计器读取路径必须跟契约真相源走

## 现象
- 品牌漂移审计报 13 errors：Dashboard 每个 CSS 颜色都说"与品牌契约不符"
- 逐条对照真实渲染，颜色全对——全是误报

## 根因
`brand-drift.js` 从 `brand-dna.md` 扫十六进制色值当契约基准，但色值契约早已迁到 `assets/vivi-tokens.json`（`{tokens:[{css,type:"color",value}]}`）。brand-dna.md 成了零 hex 的残留副本 → 校验器 hex 集为空 → 任何 CSS 颜色都不在"契约"里 → 全部报漂移。

危险点：**误报会把枪口对准正确实现**——按这个报告去"修"，就会把对的渲染改成错的，违反「改实现不改契约」纪律。审计器读错源比业务代码读错源更阴，因为它自带"我很权威"的光环。

## 修复
`loadContract()` 改为先读 vivi-tokens.json（契约单一真相源），从中抽 `type==="color"` 的 hex 集 + `--font-head`；读不到再 fallback 解析 md。CSS/HTML 渲染验证正确，一个没改。

## 预防
- 品牌契约色值从 md 迁到 tokens.json 时，**消费端（校验器）要跟着迁**，不是只搬数据
- 改审计器前先问：我读的这份文件，现在还是不是被审契约的真相源？残留副本还在原路径 = 定时误报
- 全量误报（几乎每项都报）先怀疑基准源读错，别怀疑实现
