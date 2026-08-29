---
type: diagnosis
date: 2026-08-20
source: ComfyUI MCP 接入，启动探测缺硬件块
---

# comfy-mcp 启动探测缺机器快照：必须设 COMFY_BIN 指向 venv 里的 comfy.exe

## 现象
comfy-mcp 用 `D:/tools/comfy-mcp/.venv/Scripts/comfy-mcp.exe` 启动后，返回的 instructions 里没有 hardware 块（GPU/VRAM 快照缺失），后续无法正常做机器状态判断。

## 根因
comfy-mcp 依赖 `comfy-cli`（即 `comfy.exe`）探测 ComfyUI 环境与硬件。当 venv 不在 PATH 上、且未显式指定 comfy 可执行文件位置时，启动探测拿不到机器快照，静默降级。

## 修复/步骤
注册 MCP 时给 comfy-mcp 设环境变量 `COMFY_BIN`，指向 venv 里的 comfy 可执行文件：
```
COMFY_BIN = D:/tools/comfy-mcp/.venv/Scripts/comfy.exe
```
设完后重启 Claude Code，探测结果出现 RTX 5060 Ti / VRAM 字节数即成功。

## 预防
comfy-mcp 或任何依赖 comfy-cli 的集成，先确认 `comfy` 可执行文件能被找到：要么 venv 进 PATH，要么显式设 `COMFY_BIN`。静默缺硬件快照不报错，但下游判断会失真。
