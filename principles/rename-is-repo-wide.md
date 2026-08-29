---
type: governance
date: 2026-08-28
source: AGENT.md 改名 AGENTS.md 漏更新两棵文档树，tree-drift 门禁报红
---

# 改名是全仓库一致动作：代码、文档树、散文、门禁四者同步

## 是什么
重命名一个文件不是"改文件名"一个动作，而是一个**全仓库一致性操作**：代码引用、文档树声明、散文提及、门禁/配置引用，四处都要同步。漏任何一处，要么运行时报错，要么门禁报红（好）或静默漂移（坏）。

## 怎么用
改名清单（四类，一项都不能漏）：
1. **代码引用** — import/require/read 该文件的地方（grep 全库）
2. **文档树** — README / AGENTS.md / 说明书等声明的目录树条目
3. **散文提及** — 文档正文里指代该文件名的文字
4. **门禁/配置** — inspection.json、audit 脚本、schema 里的引用

改名后立刻跑项目自带门禁（tree-drift / inspection / 相关审计），让机器兜底人工遗漏——门禁报红是保护，不是麻烦。

## 案例
`AGENT.md` → `AGENTS.md`：更新了代码（routes/tree-drift/docs-fresh/_script/inspection）和 README，但漏了 AGENTS.md 自己的树 + 使用说明书.html 的树 → `auditTree()` 报 2 处"树列了磁盘没有「AGENT.md」"。补上两棵树后 errors=0。

## 边界
- 门禁能兜底"树条目"型遗漏，兜不住"散文语义"型遗漏——人工 grep 仍是第一道防线
- 文档树如果是从磁盘生成的派生视图（而非手写），改名会自动同步——优先做成派生
- 历史文档/经验日志里对旧名的指代不必回改（它们是当时的事实记录）
