# Windows 启动脚本 start /b 会在父进程退出时杀死子进程
type: diagnosis
date: 2026-06-22
source: 系统重启后 agentboard:3099 未自启 → inspector:3101 卡"启动中"

## 现象
Windows 重启后，启动文件夹里的 `.bat` 脚本用 `start /b` 拉起的 Node.js 常驻服务不存活。但同一个脚本里其他进程碰巧活下来了（不可靠），造成"偶尔能自启、偶尔不行"的错觉。

## 根因
`start /b` 让子进程**共享父 cmd.exe 的控制台**。启动文件夹的批处理跑完 → cmd.exe 退出 → 控制台引用计数归零 → Windows 销毁控制台 → `CTRL_CLOSE_EVENT` 发给所有附着进程 → Node.js 默认收到信号退出。

scheduler 有时活下来是因为还有其他进程附着在同一控制台（延长了控制台生命周期），或者后续 guard.ps1 定时任务补刀。agentboard 就没这么幸运。

## 修复
```batch
# 错误：共享控制台，父死子灭
start /b node server.js

# 正确：独立最小化窗口，各管各的控制台
start "" /min "C:\Program Files\nodejs\node.exe" "绝对路径\server.js"
```

两个关键点：
1. `start "" /min` — 给子进程**自己的控制台**（最小化不可见），父子互不影响
2. 可执行文件用**绝对路径** — 启动文件夹执行时 PATH 可能尚未完整加载

VBS 同理。`WshShell.Run "cmd /c start /b ..."` 虽然比裸 bat 稍好（`Run` 第三个参数 False 不等待），但内层 `start /b` 仍然把进程绑在 cmd 的控制台上，不保险。

## 预防
- 所有启动文件夹的常驻服务脚本，一律用 `start "" /min 绝对路径` 模式
- 参考本机已验证存活的方式：`OpenClaw Gateway.cmd`（`start "" /min cmd.exe /d /c ...`）
- 现存的 `lark-channel-bridge.vbs` 仍用 `start /b`，目前碰巧活着但应择机迁移
