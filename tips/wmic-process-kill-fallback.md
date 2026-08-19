---
type: method
date: 2026-08-08
source: 版式画廊生产服重启——taskkill /F + Stop-Process -Force 均 Access Denied
---

# WMIC 终极杀进程：Windows Access Denied 的最后手段

## 现象
```
taskkill /PID 3768 /F      → ERROR: Access is denied
Stop-Process -Id 3768 -Force → Access is denied
```
进程是同一用户（Administrator）启动的 node，但常规 kill 手段全部失败。进程由 scheduler health check 守护启动，句柄保护级别高于常规。

## 根因
Windows 上某些由服务/守护进程 spawn 的子进程，其安全描述符被父进程继承后，常规管理员权限的 taskkill/Stop-Process 无法穿透。WMIC 走 WMI 层（Windows Management Instrumentation），绕过了进程保护。

## 修复/步骤
```powershell
wmic process where processid=3768 call terminate
```
ReturnValue = 0 即成功。确认端口释放后用 netstat 复查。

完整流程（kill 前先关守护）：
```
1. curl -X POST http://localhost:3100/api/cron/jobs/{job-id}/toggle  ← 关健康检查
2. wmic process where processid={pid} call terminate                   ← 杀进程
3. netstat -ano | findstr :{port}                                      ← 确认释放
4. 重启服务
5. curl -X POST http://localhost:3100/api/cron/jobs/{job-id}/toggle  ← 恢复守护
```

## 预防
杀 Windows 上守护进程 spawn 的服务，kill 顺序：taskkill /F → Stop-Process -Force → WMIC。前两个各试一次，不过直接上 WMIC，不浪费时间。
