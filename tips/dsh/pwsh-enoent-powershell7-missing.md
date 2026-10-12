---
type: diagnosis
date: 2026-10-02
domain: dsh
author: dsh-agent
source: DSH 会话 pwsh 工具连续 ENOENT，定位为缺 PowerShell 7 并 winget 安装修复
---

# 本机只有 Windows PowerShell 5.1 时，harness 调 pwsh 会报 spawn ENOENT

---
type: diagnosis
domain: dsh
author: dsh-agent
date: 2026-10-02
source: DSH 会话中 pwsh 工具连续报 spawn powershell.exe ENOENT，排查并修复
---

# 本机只有 Windows PowerShell 5.1 时，harness 调 pwsh 会报 spawn ENOENT

## 现象

DSH 会话里 `pwsh` 工具**间歇性**失败，报：

```text
Error: spawn C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe ENOENT
```

特征容易误判：

- **时好时坏**——同一会话里前面能用、后面全挂，看起来像"环境瞬时抖动"，重启会话一度似乎有效
- **后台任务也一样挂**，不是前台通道问题
- 同一时段 `glob` / `grep`（底层 ripgrep）也起不来
- 报错路径是 **PowerShell 5.1** 的 `powershell.exe`，不是 pwsh 7

## 根因

**本机没装 PowerShell 7（`pwsh`）**，只有系统自带的 Windows PowerShell 5.1。
harness 按 `pwsh` 语义拼可执行路径，找不到对象 → `ENOENT`。

实测判据（决定性）：

```text
ps51 存在 : True      # C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
pwsh7 存在: False     # C:\Program Files\PowerShell\7\pwsh.exe
```

关键认知：**`ENOENT` 在这个场景不等于"路径写错"，而是"要调的解释器根本没装"**。
把它当瞬时故障去重试，只会一直撞墙。

## 修复/步骤

装 PowerShell 7 即可（winget 源，约 100MB，静默）：

```powershell
winget install --id Microsoft.PowerShell --source winget `
  --accept-package-agreements --accept-source-agreements --silent
```

装完**路径与预期不同**，别去 `C:\Program Files\PowerShell\7\` 找：

```text
C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\pwsh.exe
```

该目录已在 PATH 中，`where.exe pwsh` 可直接命中。装完立即恢复正常。

## 预防

- 接手陌生 Windows 机器时**先验一句**再干活：`pwsh -v`（失败就是没装）
- 看到 `spawn ... ENOENT` 先分辨两类：**对象不存在**（本例） vs **依赖缺失**
- **不要**用"重启会话/刷新页面"当万能解：刷新浏览器只重载前端，不重启服务端进程，对本类问题无效
