# 类比 ≠ 实现

type: pattern
date: 2026-08-03
source: portfolio hero redesign — 用户说"类比湖仓"，Agent 在 catalog.html 实现了完整的 Bronze/Silver/Gold 分层过滤器

## 现象
用户说"像X一样"/"类比Y"/"参考Z的思路"，Agent 把 X/Y/Z 的功能实现搬进了项目。

## 根因
LLM 把语义类比（概念借用）理解成功能需求（架构复刻）。用户的真实意图是文案层打比方，Agent 理解成逻辑层实现。

## 修复
删除 catalog.html 中所有分层 UI：intro div、layer filter pills、data-layer 属性、JS 分层逻辑（~80行）。文案回归 index.html 卡片内一句话："分散存储 + 集中视图——类比湖仓，不建第二个家。"

## 预防
听到"类比/像/参考/借鉴思路"时三问确认：
1. 概念借用还是功能复刻？
2. 在文案层还是逻辑层？
3. 用户看过X的真实形态吗？（没看过 = 大概率只想要概念）
