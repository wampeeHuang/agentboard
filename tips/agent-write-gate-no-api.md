# Agent 写入门禁不需要新建 API 服务
type: method
date: 2026-08-05
source: source-rack 写入门禁方案评审——从"加三个 API 端点"精简到"改一个 CLAUDE.md"

## 现象
多个 agent 需要向同一个数据源写入（如 Obsidian .md 文件），本能反应是加 API 网关——GET /vocabulary、POST /validate、强化 POST /sources。方案评审时发现是过度工程。

## 根因
写文件不需要服务器。agent 需要知道的是三件事：
1. 文件格式和字段枚举
2. 合法标签（分类词表）
3. 怎么验证写对了

这三件事文件就能回答——CLAUDE.md 写合同，domain-registry.js 做词表，validate.js 做验证。

## 修复/步骤
1. 在 CLAUDE.md 写好 agent 写入流程：读词表 → 写文件 → 跑验证 → 刷新确认
2. 分类词表只在一处定义（domain-registry.js），CLAUDE.md 放指针不复制数据
3. 工具架 manifest 只描述"能做什么"，不列数字、不列词表

## 预防
接到"让外部 agent 能写入"的需求时，先问：写入的本质是什么？如果只是新建文件，大概率不需要新服务。
