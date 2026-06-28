# Windows Get-Process -Id 不可靠——用端口健康检查代替 PID 文件做守护检测
type: diagnosis
date: 2026-06-28
source: scheduler 多实例状态竞争——guard.ps1 的 Get-Process 和 WMI 回退均未检测到 3 个运行实例，每次触发都新增不杀旧

## 现象
- `Get-Process -Id <有效PID>` 返回 `$null`，进程明明在运行（tasklist 看得到，netstat 看得到端口）
- 导致 guard 脚本误判进程死亡，启动新实例
- 多次触发后累积多个进程，只有一个能绑端口，其余在后台空转
- 空转实例用过期内存状态覆盖共享文件

## 根因
Windows 上 `Get-Process -Id` 有时找不到有效 PID。本机已多次发生（PID 51216 在 tasklist/netstat 中可见但 Get-Process 返回空）。原因未完全定位，怀疑与权限/进程启动方式（Start-Process -WindowStyle Hidden）有关。

## 修复
端口是最可靠的不变量——操作系统不会让两个进程绑同一个端口。两处收敛为端口检查：

**守护检测（guard.ps1）**：
```powershell
# 唯一存活性信号——端口健康检查
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3100/api/cron/health" -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok = $true }
} catch {}
```

**互斥保证（start.js）**：
```javascript
// 端口被占→直接退出，杜绝多实例
var testSocket = new net.Socket();
testSocket.connect(3100, '127.0.0.1', function() {
  console.error('Port 3100 already in use, refusing to start duplicate');
  process.exit(1);
});
```

## 预防
- Windows 上不要用 PID 文件做守护脚本的存活性检测
- 不要用 `Get-Process -Id` 验证进程是否活着
- 不要用 WMI `Get-CimInstance Win32_Process` 做回退——它和 Get-Process 一样不可靠
- 唯一可靠方案：进程暴露 HTTP 健康端点 → guard 脚本只查端口
- 同一端口的两个检查（guard 的 GET + start 的 connect）共享同一不变量，不存在不一致窗口
