---
type: method
date: 2026-08-11
source: Workflow Engine 笔记——Mermaid 图中出现 `@trigger.dev/sdk`、Dequeue、RunAttempt 等专有名词，未解释
---

# 技术写作——npm包名和子系统名首次出现必须定义

## 现象

正文或架构图中出现 opaque 专有名词（npm 包名、内部子系统名、平台特有缩写），读者看不懂。

读者反应："`@trigger.dev/sdk` 这是什么？Dequeue RunAttempt 是专有名词吗？"

## 根因

知识诅咒——作者读完官方文档后对这些名词烂熟，忘了新读者第一次见到时是 opaque 的。

高发场景：
- npm 包名（`@scope/package`）— 没装过这个包的读者不知道它是 SDK 还是 CLI 还是插件
- 内部子系统名（Dequeue、Waitpoint）— 平台特有命名，Google 都搜不到
- 首字母大写非通用缩写（RunEngine、Checkpoint-Resume 可接受；Dequeue 作为节点名需解释）

## 步骤

1. 图中/正文首次出现 opaque 专有名词 → 下方 3 行内跟一句话定义（是什么 + 类比什么）
2. 如果是架构图，图后加术语表——不要求详细，一行一个即可
3. 门禁：扫描文中的 `` `@scope/name` `` 格式和架构图中的首字母大写非通用名词 → 每个在下方 3 行内必须有定义

## 预防

写完技术文档后，找一个不了解这个生态的人的问题视角自检：图中每个节点名，不读官方文档能看出它干什么吗？不能 → 补一句话。
