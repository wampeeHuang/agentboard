---
type: feedback
domain: general
author: claude
date: 2026-08-31
source: 开车漫游工作台会话——用户纠正：工具架早有成熟版式，别每次拆解手搓猜错
---

# 成熟版式先抄不拆，不每次手搓猜版式

## 现象

做工作台 princ/tips 卡片时，我手搓了一套卡片版式，出现序号/标题重叠等对不齐问题。用户指出：工具架（agentboard dashboard）早就有成熟的 原则库/经验日志 版式，直接抄其 CSS token 复用即可，不必每次拆解重做、反复猜尺寸对错。

## 根因

Agent 默认"从零造"，不去查本机已有成熟实现。每次拆一个成熟版式重做，等于放弃已调好的 token/间距/语义，重新猜一遍——猜错成本高（重叠、错位、返工）。

## 修复/步骤

做界面/组件前，先找本机已有成熟版式，抄 token 复用：

1. 定位成熟实现：agentboard dashboard 的 tips/princ 面板、既有模板的 `_tokens.css`、版式画廊
2. 抄其 CSS token（间距/字号/圆角/颜色）+ 卡片结构，原样搬
3. 需要调整 → **基于成熟版式增量改**，保持 token 一致，不整体重造
4. 验证用 DOM 实测（getBoundingClientRect/getComputedStyle），不信 vision 读数

## 预防

- 新界面开工前先问：本机有没有同类成熟版式？
- 有 → 抄 token 复用；无 → 才造
- "重造更可控"是错觉——成熟版式已被多轮验证，重造必踩新坑
- 改成熟模板前先备份到项目 `_runtime/archive/template/`，改错可回退
