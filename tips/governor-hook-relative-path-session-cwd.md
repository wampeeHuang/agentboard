---
type: diagnosis
date: 2026-08-27
source: workspace-governor hook 拦截跨目录 rm 命令，相对路径解析到会话 cwd 而非 shell cd
---

# workspace-governor hook 把 Bash 相对路径解析到会话 cwd，不是 shell 的 cd

## 现象

`cd /c/Users/Administrator/.supervisor/_runtime && rm -f _panel-script-check.js ...` 被 governor hook 拦下，报错路径是 `C:\Users\Administrator\.agentboard\_panel-script-check.js`——明明 cd 进了 supervisor 目录，hook 却盯着 `.agentboard`。改用绝对路径后通过。

## 根因

hook 的 `_shell_candidates` 按 `&&` / `;` / 换行切段，每段独立解析；相对路径一律拿 `payload.cwd`（Claude 会话工作目录）当基准做 `resolve_candidate`，**不解析同命令里的 `cd`**。会话 cwd 是 `.agentboard`，于是 `_panel-script-check.js` 被解析成 `.agentboard/_panel-script-check.js`，撞上一级入口删除拦截。

## 修复/步骤

跨目录的 rm / mv / Write 用绝对路径，别依赖 `cd`：

- Bash: `/c/Users/Administrator/.supervisor/_runtime/xxx`
- PowerShell: `C:\Users\Administrator\.supervisor\_runtime\xxx`

单条命令里 `cd &&` 连写不改变 hook 的解析基准。

## 预防

- 结构性命令（删除 / 移动 / 新建目录）一律带绝对路径
- hook 报的路径和直觉不符 → 先查是不是相对路径被解析到了会话 cwd
