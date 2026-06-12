# Agentboard 架构原则
type: feedback

## 核心理念
文件即注册，状态即界面。

## 设计原则
1. **无数据库** — 文件系统就是数据库。manifest.json = 一行记录
2. **自发现** — Agent 通过 `GET /api` 自动发现所有端点和工具
3. **端口即状态** — netstat 扫描端口判断运行状态，不依赖 PID 文件
4. **自指系统** — Agentboard 自身也是工具架上的工具，形成闭环
5. **三区一体** — tools(能力) + skills(方法) + tips(经验) 共用渲染引擎

## 为什么不用数据库
- SQLite 需要迁移、驱动、查询语言
- 文件系统不需要：ls = SELECT, rm = DELETE, vim = UPDATE
- Agent 可以直接读写文件，不需要学习 SQL
- 备份 = cp -r，恢复 = cp -r
