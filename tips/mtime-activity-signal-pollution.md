---
type: diagnosis
date: 2026-07-29
source: catalog server.js walkMaxMtime 修复
---

# mtime 活跃信号被会话产物污染

## 现象

项目活跃度面板所有项目都显示"今天活跃"。实际大部分项目近期无改动。

## 根因

用文件系统 mtime 度量项目活跃度时，Agent 会话产物（HANDOFF.md、CHECKPOINT.md）和构建缓存（`__pycache__`、`_runtime`、`_output`）每次会话都被写入，mtime 刷新到当天。这些文件的改动不代表项目真实活跃。

## 修复

在 mtime 遍历函数中排除已知会话产物和缓存目录：
- 目录：`__pycache__`、`_runtime`、`_output`、`node_modules`
- 文件：`HANDOFF.md`、`CHECKPOINT.md`

## 预防

任何用"最新文件修改时间"作为活跃度/新鲜度信号的系统，必须维护噪声文件排除清单。新增 Agent 行为（如新增一种会话产物文件）时，检查清单是否需要更新。
