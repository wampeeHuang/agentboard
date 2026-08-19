---
type: diagnosis
date: 2026-07-13
source: Claude Code session guard 调试——hook 阶段性弹出终端窗口，显示红字后消失
---

# Windows hook 命令弹出控制台窗口

## 现象

Claude Code hook（SessionStart/Stop/PreToolUse 等）执行时，阶段性弹出可见的终端窗口，闪现红字错误信息后消失。hook 本身功能正常，但弹窗干扰用户。

## 根因

node.exe 在 Windows 上以 console subsystem 编译。当作为子进程启动时，kernel32 自动为其分配一个控制台窗口。即使 hook 不需要 UI，窗口也会短暂出现。红字来自 PowerShell 的 stderr 输出（不是错误——hook 正常执行，只是 stderr 不被 Claude Code 消费，管道断开后窗口关闭）。

## 修复

所有 hook 命令外层包裹 `powershell -WindowStyle Hidden -Command "..."`。PowerShell 创建一个隐藏窗口作为子进程的 console host，node.exe 的输出被路由到隐藏窗口，用户不可见。

```json
// settings.json → hooks → PreToolUse
{
  "type": "command",
  "command": "powershell -WindowStyle Hidden -Command \"& 'C:\\Program Files\\nodejs\\node.exe' '...checkpoint.js'\"",
  "timeout": 3
}
```

关键：`-WindowStyle Hidden` 必须在最外层的 PowerShell 上，不是在 node.exe 上。node.exe 不支持 `-WindowStyle`。

## 预防

Windows 平台新增 hook 命令时，默认外层包裹 `powershell -WindowStyle Hidden -Command "..."`。不用 `cmd /c`——cmd 没有隐藏窗口的能力。
