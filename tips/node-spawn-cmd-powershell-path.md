# Node spawn 跑 PowerShell 必须直连，不能过 cmd /d /c

type: diagnosis
date: 2026-06-18
source: backup-daily-fdrive cron job 连续失败，报"路径中具有非法字符"

## 现象

runner.js 的 runShell() 将所有命令通过 `spawn('cmd', ['/d', '/c', command])` 执行。
当 command 是 `powershell.exe -ExecutionPolicy Bypass -File C:\Users\Administrator\.agentboard\cron\backup.ps1` 时，
PowerShell 报错：`处理 -File "C:\Users\Administrator\.agentboard\cron\backup.ps1" 失败: 路径中具有非法字符`。

同一个命令直接在 cmd.exe 窗口里跑——正常。通过 Node spawn 跑——失败。

## 根因

`cmd /d /c <command>` 在 Node spawn 的子进程环境中，参数解析行为与交互式 cmd.exe 不同。
PowerShell 的 `-File` 参数接收到的路径已被 cmd 层破坏（具体破坏点未确定，但症状稳定复现）。

## 修复/步骤

检测 PowerShell 命令，直接 spawn `powershell.exe`，不经过 cmd.exe：

```js
var isPS = /^powershell(\.exe)?(\s|$)/i.test(command);
if (isPS) {
  spawnBin = 'powershell.exe';
  var rest = command.replace(/^powershell(\.exe)?\s*/i, '').trim();
  spawnArgs = rest.split(/\s+/);  // -ExecutionPolicy Bypass -File <path>
} else {
  // 非 PowerShell 命令继续走 cmd /d /c
  var shell = shellCmd();
  spawnBin = shell.bin;
  spawnArgs = shell.args.concat([command]);
}
spawn(spawnBin, spawnArgs, opts);
```

超时时加 `taskkill /PID <pid> /T /F` 清进程树，防止 robocopy 等子进程变孤儿。

## 预防

- runner.js 里任何需要调 PowerShell 的 job，命令开头写 `powershell.exe`，会自动走直连路径
- 不要试图在 jobs.json 里用 `cmd /d /c` 手动包一层——runner 已经处理了
