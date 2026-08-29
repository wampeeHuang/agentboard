---
type: diagnosis
date: 2026-08-28
source: AGENT.md 改名 AGENTS.md 后 tree-drift 报两处"树列了磁盘没有"
author: dsh-agent
---

# 改名必须同步所有文档树：漏一棵，tree-drift 门禁就红

## 现象
把治理文件 `AGENT.md` 改名为 `AGENTS.md` 后，更新了代码引用（routes/tree-drift/docs-fresh/_script/inspection）和 README，但复跑 `auditTree()` 仍报 2 处错误：
- `AGENTS.md：树列了磁盘没有「AGENT.md」`
- `使用说明书.html：树列了磁盘没有「AGENT.md」`

## 根因
项目的三树一致性门禁（lib/tree-drift.js）会**逐条核对 AGENTS.md / README / 使用说明书.html 三份文档里声明的目录树与磁盘文件**。改名时我漏了两棵树的条目本身：AGENTS.md 自己的架构树、docs/使用说明书.html 的树——它们仍写着旧名，磁盘上已不存在该文件 → 门禁报"删除或迁移后树未更新"。

## 修复/步骤
把三份文档树里的旧名条目全部改为新名（不是删除——文件还在，只是改名）：
```powershell
# 对 AGENTS.md 和 docs/使用说明书.html 都执行
$c -replace 'AGENT\.md','AGENTS.md'
```
然后复跑 `node -e "require('./lib/tree-drift.js').auditTree()"` 确认 errors=0。

## 预防
- 重命名文件的**完整清单** = 代码引用 + 文档树 + 散文提及 + 配置/门禁，一项都不能漏
- 改名后立刻跑项目自带门禁（tree-drift/inspection），让机器兜底人工遗漏
- 三树一致性本身是好的设计：文档树从磁盘生成更好，但人工维护时改名必查三处
