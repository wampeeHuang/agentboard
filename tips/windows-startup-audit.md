---
type: method
date: 2026-07-13
source: 本机 17 项 Startup → 7 项清理，发现 4 僵尸 + 3 重叠机制
---

# Windows 开机自启审计：四层逐项对抗

## 步骤

### 1. 枚举所有层

```
Startup 文件夹:     Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
Task Scheduler:     schtasks /query /fo list | Select-String "TaskName|Status|Next"
PM2 进程列表:       pm2 list; pm2 jlist (查看 dump.pm2 会复活什么)
Registry Run:       Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
                    Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
服务 (Services):    Get-Service | Where-Object StartType -eq "Automatic"
```

### 2. 逐项对抗（四条全过才算有效）

| # | 检查项 | 命令 | 不通过 = 僵尸 |
|---|--------|------|-------------|
| 1 | 磁盘文件存在 | `Test-Path` 或 `Get-ChildItem` | 快捷方式指向已删文件 |
| 2 | 进程存活 | `Get-Process -Name` | 启动项在但进程死 |
| 3 | 端口监听 | `netstat -ano \| Select-String "LISTENING"` | 进程在但端口不对 |
| 4 | 无机制重叠 | 交叉对比四层 | 两个机制启同一服务 |

### 3. 判重叠

同一服务出现 ≥2 次 → 选一个保留，其余删除。判断标准：
- 谁有 crash 恢复能力？（PM2 > Task Scheduler > Startup 裸脚本）
- 谁有日志？（PM2 > Task Scheduler > Startup 裸脚本）
- 谁更简单？（Startup 裸脚本 > Task Scheduler > PM2）

保留最可靠的那个，不是最简单的那个。

### 4. 清理顺序

1. 先停重叠机制（确认主机制已接管）
2. 删启动项文件
3. 杀旧进程（如果主机制已拉起新的）
4. 验证端口仍存活

## 预防

- 新增服务时先问：这个服务现在由谁启？加第二套机制前先看第一套是否够用
- 守护 ≠ 自启：Task Scheduler 做 crash 恢复，PM2/Startup 做开机自启。职责分开
- 守护脚本不允许静默失败：服务不存在时报错（服务未安装 ≠ 服务挂了）
