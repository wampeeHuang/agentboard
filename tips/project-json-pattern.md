# .project.json 文件系统元数据模式
type: method
description: 在项目目录下放一个 .project.json，Agentboard 自动扫描并渲染为项目卡片。零数据库，文件即状态，人工定义 status + 自动计算 recency。
date: 2026-06-12

## 用法
项目目录下创建 `.project.json`：
```json
{"name": "排版工匠", "description": "Markdown→微信HTML排版工具", "status": "active"}
```

Agentboard 扫描 `projectPath` 下所有子目录，自动读取 `.project.json` 并渲染为项目卡片。

## 两个维度

| 维度 | 来源 | 更新方式 |
|------|------|---------|
| status（状态） | `.project.json` → 人工定义 | 人手动改文件 |
| recency（活跃度） | 目录最新文件 mtime → 自动计算 | walkDir 遍历所有文件取最大 mtime |

## 状态枚举
- `active` — 活跃推进中（🟢）
- `archived` — 已完成/暂停，保留备查（🟡）
- `abandoned` — 不再维护（⚫）
- `undefined` — 尚未定义，默认值（⚪）

## 时间分档
7天内 → 15天内 → 30天内 → 超过30天（根据目录内最新文件 mtime 自动归入）

## 适用场景
项目工作区（48 个子项目）、文章生产目录（46 篇）、图文内容目录（31 套图鉴）— 任何"一个目录 = 一个项目单元"的场景，不需要建表、不需要 API。
