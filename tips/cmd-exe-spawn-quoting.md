---
type: diagnosis
date: 2026-07-10
source: supervisor.js 5个服务连续死亡，forma :3103 无法访问
---

# Windows cmd.exe spawn 空格路径引号 bug

## 现象
supervisor spawn 的所有 npm/npx 服务（路径含 `C:\Program Files\nodejs\`）启动后 3-8 秒退出，exit code 1。手动在终端执行相同命令正常运行。

## 根因
`fixSpacedShell` 函数将 `.cmd` 文件的绝对路径传给 `cmd.exe /d /c`，引号处理错误：

```javascript
// 错误：cmd.exe /c 把第一个和最后一个 " 剥离
// 传入: cmd.exe /d /c "\"C:\Program Files\nodejs\npm.CMD\" run dev"
// cmd 剥离外层引号后: C:\Program Files\nodejs\npm.CMD" run dev  ← 残留引号
```

Node.js spawn 对含空格和引号的 arg 会再加一层转义，cmd.exe `/c` 的引号规则（剥离首尾 `"`）与 Node 的转义互相作用，产生不可预测的命令行。

## 修复
放弃解析绝对路径 + fixSpacedShell 的方案。对 `.cmd/.bat` 可执行文件直接用**原始命令名 + shell:true**，让 cmd.exe 自己从 PATH 查找：

```javascript
// 正确：用原始命令名，shell:true
var exe = useShell ? parsed.originalExe : parsed.executable;
spawn(exe, args, { shell: true, cwd: ..., ... });
// Node 内部生成: cmd /d /s /c "npm run dev" — 正确处理
```

## 预防
- Windows 上 spawn `.cmd/.bat` 文件时，不要传绝对路径，用原始命令名 + shell:true
- 绝对路径含空格 + shell:true = cmd.exe 把 `C:\Program` 当成命令名
- `cmd.exe /c` 的引号剥离规则与 `cmd.exe /s /c` 不同，不要混用
