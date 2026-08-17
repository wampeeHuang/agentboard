# 架构迁移后 CLAUDE.md 漂移成废纸——agent 冷启动读到错误信息

type: pattern
date: 2026-07-30
source: evopearl-data — 多次架构迁移（OpenClaw→scheduler、v1→v2 prompt、runtime→D:\workspace）后 CLAUDE.md 仍描述旧架构

## 现象

Agent 冷启动读 CLAUDE.md，按里面说的去调 OpenClaw gateway port 18789——但 OpenClaw 半年前就迁走了。job 名、cron 时间、工作目录全是错的。Agent 读了一份"历史小说"当操作手册。

## 根因

四次架构迁移都改了代码和配置，没人同步改 CLAUDE.md：

| 迁移 | 改了 | CLAUDE.md 还写着 |
|------|------|-----------------|
| OpenClaw → scheduler | 调度器进程、API 端口 | OpenClaw gateway port 18789 |
| runtime → D:\workspace | 工作目录 | C:\Users\Administrator\_runtime |
| v1 → v2 prompt | 三栏变两栏、新 job 名 | 旧 job 名、旧 cron 时间 |
| Git Integration 解耦 | 部署触发机制 | Gate 5 内嵌部署（已废弃的旧架构） |

每次迁移时 CLAUDE.md 被视为"给人看的项目介绍"而非"agent 的操作系统"。但 agent 冷启动时它是第一个文件——读错 = 全盘跑偏。

## 修复

整文件重写 CLAUDE.md，对齐当前真实状态。核心原则：

> CLAUDE.md 是 agent 冷启动的 OS。不是给人看的 README。每行必须可执行验证。

## 预防

- 架构迁移 checklist 加一项："更新 CLAUDE.md，逐条核对是否仍可执行"
- 不相信"上次是对的现在应该还是对的"——CLAUDE.md 默认假设是"已经漂移"
- 验证方法：让另一个 agent 冷启动读 CLAUDE.md，看它能否正确理解架构

## 适用场景

- 任何有 CLAUDE.md 的项目经历架构迁移
- CI/CD pipeline 换了但 README 还在说旧流程
- 多 agent 协作项目——每个 agent 都从 CLAUDE.md 冷启动
