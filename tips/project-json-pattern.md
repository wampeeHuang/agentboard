# 文件系统即数据库：.project.json 项目元数据模式
type: pattern
date: 2026-06-12
source: 工作区子页面 — 项目卡片状态+时间筛选

## 模式
项目目录下放一个 `.project.json`，Agentboard 扫描时自动读取并展示。零依赖，无数据库，文件即状态。

```json
{"name": "排版工匠", "description": "Markdown→微信HTML排版工具", "status": "active"}
```

## 两个维度
| 维度 | 来源 | 更新方式 |
|------|------|---------|
| status（状态） | `.project.json` → 人工定义 | 人手动改文件 |
| recency（活跃度） | 目录最新文件 mtime → 自动计算 | walkDir 遍历所有文件取最大 mtime |

## 状态枚举
- `active` — 活跃推进中
- `archived` — 已完成/暂停，保留备查
- `abandoned` — 不再维护
- `undefined` — 尚未定义（默认值）

## 时间分档
- 7天内 / 15天内 / 30天内 / 超过30天

## 适用场景
- 项目工作区（30+ 子项目）
- 文章生产目录（40+ 篇文章）
- 图文内容目录（30+ 套图鉴）

任何"一个目录 = 一个项目单元"的场景都能直接用，不需要建表、不需要 API。
