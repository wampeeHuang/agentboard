---
type: fact
date: 2026-08-20
source: ComfyUI MCP 接入，claude mcp add -e 传环境变量报错
---

# `claude mcp add -e` 的变长 env 参数会吞掉 name 位置参数

## 现象
`claude mcp add -e COMFY_BIN=D:/.../comfy.exe comfy-mcp -- "D:/.../comfy-mcp.exe"` 报错 `missing required argument 'commandOrUrl'`，看似命令没写对，实际参数被错配。

## 根因
`-e` 是 variadic 参数（`<env...>`），贪婪吞掉后面所有 token 直到遇到 `--` 或 flag。命令里 `comfy-mcp`（name）被当成 env 值吃掉了，导致 `commandOrUrl` 位置参数缺失。

## 修复/步骤
分两步：
1. 先不带 env 注册：`claude mcp add -s user comfy-mcp -- "D:/tools/comfy-mcp/.venv/Scripts/comfy-mcp.exe"`
2. 直接编辑 `.claude.json` 的 `mcpServers.comfy-mcp` 补 `env` 字段（改前先备份 `.claude.json`）。

## 预防
`claude mcp add` 传 env 变量时别用 `-e` 内联，注册后再写 `.claude.json`。凡 variadic 参数后跟位置参数，先用 `--` 分隔，否则位置参数会被吞。
