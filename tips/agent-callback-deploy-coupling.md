---
type: diagnosis
date: 2026-07-22
source: data.evopearl.com 部署管线重构
---

# Agent 回调部署耦合——scheduler 崩溃导致部署静默丢失

## 现象
Agent 产出 JSON 文件成功，scheduler 回调负责 git push。scheduler 在 agent 运行期间崩溃，回调未触发，网站未更新。无报错，无告警——静默失败。

## 根因
"agent 产出"和"部署上线"是两个步骤，通过 scheduler 进程内回调耦合。进程崩 = 回调丢 = 部署静默丢失。

## 修复
Agent 一线到底：Gate 4（写 JSON）→ Gate 5（固定 git add/commit/push 命令）。Agent 自己跑到终点，不等外部回调。
Scheduler 降级为巡检：tick 扫描未提交文件 → 告警，不动手。

## 预防
- 任何"agent 产出 → 外部触发 → 下一步"的架构，问：如果外部触发崩了，下一步还执行吗？
- 能一线到底就一线到底。能自包含就自包含。
- 固定机械操作（git push）放 agent prompt 里当固定命令，不放 scheduler 回调里。
- Scheduler 只做巡检，不做 agent 的依赖。
