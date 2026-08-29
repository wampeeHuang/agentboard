---
type: diagnosis
date: 2026-08-25
source: Claudian 接入 Obsidian — Windows npm 全局安装 claude-code 的 CLI 路径配置
---

# Windows 下 spawn Claude Code 必须指 cli-wrapper.cjs，不用 .cmd/.ps1

## 现象

插件/工具需要配置 Claude CLI 路径（spawn 本地 Claude Code，如 Claudian、Codex 等 AI 面板），cliPath 填 npm 全局 bin 的 `claude.cmd` 或 `claude.ps1` 包装脚本，启动失败或行为异常。

## 根因

Windows 下 npm 全局安装的 `@anthropic-ai/claude-code`，npm 在 bin 目录生成的 `claude.cmd`/`claude.ps1` 是 shell 包装脚本，不是真实 node 入口。工具以 `child_process` spawn node 入口，直接给包装脚本路径在非 shell 环境（不经过 cmd.exe 解析）下无法工作。真实入口在 node_modules 内的 `cli-wrapper.cjs`。

## 修复

cliPath 指到 node_modules 里的真实入口：

```
C:\Users\<user>\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli-wrapper.cjs
```

## 预防

- 任何要 spawn Claude CLI 的工具（Claudian、Codex、其他 AI 面板），cliPath 一律用 `cli-wrapper.cjs`。
- 工具 README 若明确警告 Windows 路径格式，先按警告做，别用直觉填 bin 路径。
