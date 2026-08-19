---
type: diagnosis
date: 2026-07-19
source: 任务管理器显示 68 个终端进程 → 排查 MCP 生命周期泄漏
---

# Claude Code MCP 在 Windows 上累积孤儿 cmd/conhost 进程

## 现象

任务管理器看到大量 cmd.exe / conhost.exe，数量随 Claude Code session 重启持续增长（本次会话排查时 93 cmd + 67 conhost = 160 个）。

## 根因

Windows 上 MCP 进程链比 Linux 多一层：

```
Claude Code → npx(.cmd) → cmd.exe → node(MCP server)
```

npx 是 `.cmd` 批处理脚本，必须由 cmd.exe 解释执行。cmd 不会随 npx 退出——它会一直等到子进程（node MCP server）退出。每次 Claude Code session 重启：
1. 旧 MCP server 不杀 → 旧 cmd 不退出
2. 新 MCP 启动 → 新的 npx → 新的 cmd

同类 MCP（claude-mermaid、chrome-devtools-mcp、@drawio/mcp、openclaw-control-mcp）在 2-3 天内各累积 6-9 个实例。每个实例 = 1 npx wrapper(node) + 1 MCP server(node) + 1 cmd.exe + 1 conhost.exe。

**标注：不是 security issue，不是 memory leak。** 所有进程处于 idle 状态，总内存占用 ~125MB（16GB 机器上 < 1%）。唯一实际影响是任务管理器看着乱。

## 修复/步骤

### 诊断：查清来源

```powershell
# 按父进程分组
$all = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'"
$all | Group-Object ParentProcessId | Sort-Object Count -Desc | ForEach-Object {
    $parent = Get-Process -Id $_.Name -ErrorAction SilentlyContinue
    "$($_.Count) cmd ← $($parent.ProcessName)"
}

# 查 MCP 相关的 node 进程
Get-Process node | ForEach-Object {
    $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmdline -match 'mcp|mermaid|drawio|openclaw') { Write-Host "$($_.Id) $cmdline" }
}
```

### 清理：三种情况

1. **父进程已退出的孤儿**（最安全）
```powershell
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | ForEach-Object {
    if (-not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $_.ProcessId -Force
    }
}
```

2. **MCP 重复实例**（保留每个类型最新 1 个 server）
```powershell
# 找出所有 MCP node 进程，按类型分组，保留每类最新 1 个，杀其余
```

3. **暴力清场**（session 结束时）
```powershell
taskkill /F /IM cmd.exe
taskkill /F /IM conhost.exe
```

### 预防：定时清理 cron

```cron
*/30 * * * * PowerShell -Command "Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -lt (Get-Date).AddHours(-2) } | Stop-Process -Force"
```

每 30 分钟杀 2 小时前启动的 cmd。不影响当前 session 的活跃进程。

## 预防

1. **不处理也安全**。125MB < 总内存 1%，不影响性能。
2. 加上述 cron 即可兜底，防止极端情况（MCP crash-loop 刷出数百个）。
3. 根治需要 Claude Code 在 session 断开时 kill MCP 子进程树——不在本机可控范围。
