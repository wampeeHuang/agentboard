---
type: fact
date: 2026-08-16
source: 给系统说明书加四节+目录树时，发现 doctor.js 会反向审计文档内容
---

# doctor.js 反向校验系统说明书.md 内容——改它前先读 checkSystemDocDrift

## 事实

`D:\Obsidian\wiki\scripts\doctor.js` 的 `checkSystemDocDrift` + `checkGovernancePathRefs` 会反向校验 `系统说明书.md` 的**内容**（不只校验它存在）：

- **9a** 规则数断言：正文写「check.js N 条规则」必须匹配 check.js 实际规则数（正则 `check\.js[^：:]*[：:]\s*(\d+)\s*条规则`）
- **9b** 脚本存在性：正文「执行层」字符串之后列出的每个 `.js` 文件名必须真实存在
- **9c** 未覆盖反向：「## 当前未覆盖」列出的项不能是 doctor.js 已覆盖的（孤立页/断链）
- **9d-i** 绝对路径：正文里 `D:/Obsidian/...` 路径必须存在
- **9d-iii** cron 提及：`~/.scheduler/jobs.json` 里所有 `Wiki ·` 任务名必须出现在正文

## 预防

改系统说明书.md（或任何 `references/` 治理文档）前，先读 doctor.js 的 `checkSystemDocDrift` 和 `checkGovernancePathRefs`，避开三处坑：

1. 不写「执行层」字符串（9b 会扫它后面的 .js 文件名）
2. 引用治理文件用 backtick code `` `CLAUDE.md` ``，不用 `[[wikilink]]`（避免断链检查）
3. 不写绝对路径 `D:/Obsidian/...`（9d-i 会校验存在性），用相对路径

校验脚本读的是 vault 级 `D:\Obsidian\SCHEMA.md`（`path.join(WIKI, "..", "SCHEMA.md")`），不是 wiki 级副本。
