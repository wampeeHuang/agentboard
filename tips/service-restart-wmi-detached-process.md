---
type: method
date: 2026-08-28
source: 反复重启 3081/3099/3100 本地服务踩坑后验证
author: dsh-agent
---

# 本地服务重启用 WMI 脱离进程树：Task Scheduler 不可靠、子进程会随宿主死

## 场景
要杀掉并重启一个本地 Node 服务（如 agentboard :3099、DSH :3081、调度中心 :3100），且新进程不能随调用它的会话/宿主一起死。

## 三个不可靠方案（都踩过）
1. **Start-Process 直接起**：新进程是当前会话的子进程 → 宿主/会话死它跟着死
2. **Task Scheduler（schtasks / Register-ScheduledTask）**：触发不稳定（实测 ONCE 触发器到点不触发，LastTaskResult=267011"尚未运行"），且 `DisallowStartIfOnBatteries` 等默认设置会吞掉触发
3. **启动脚本里直接 taskkill + 重启**：如果被杀的是宿主自身（DSH 场景），脚本会在半路陪葬

## 修复/步骤（WMI 脱离进程树，已验证）
```powershell
# 1. 杀旧进程
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3099 -State Listen).OwningProcess -Force
Start-Sleep -Seconds 2
# 2. WMI 创建脱离进程树的新进程（父进程是 WMI 服务，不是当前会话）
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = 'cmd /c cd /d C:\Users\Administrator\.agentboard && node server.js'
}
# 3. 轮询端口就绪
for ($i=0; $i -lt 15; $i++) { Start-Sleep 1; try { (Invoke-WebRequest -Uri 'http://localhost:3099/' -TimeoutSec 3).StatusCode -eq 200; break } catch {} }
```

关键点：`Invoke-CimMethod Win32_Process Create` 创建的进程挂在 WMI 服务下，**与当前会话进程树无关**，宿主被杀也不会连坐。

## 注意
- CommandLine 里用 `cmd /c cd /d <dir> && node ...` 显式设置工作目录（WMI Create 不传 cwd）
- 服务代码改动（require 的 .js）不会热重载，改完 routes/schema 必须重启
- 重启后验证端口 + 关键 API，再继续下一步
