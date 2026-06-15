# Windows 允许同端口双进程绑定，新实例静默失效
type: diagnosis
date: 2026-06-14
source: 小红书 scraper 重启后仍跑旧代码，发现 3095 端口有 2 个进程

## 现象
改了代码、清了缓存、重启服务，API 行为没变（仍在报旧版本的错误）。`netstat -ano | findstr :3095` 显示两个 PID 同时 LISTENING。

## 根因
Windows 上如果旧进程未完全退出（端口还在 TIME_WAIT 或设置了 SO_REUSEADDR），新进程可以 bind 到同一端口。两个进程都在 LISTENING，但**旧进程实际处理请求**，新进程空挂在旁。

## 修复
```powershell
# 每次重启前验证端口是否真的释放
netstat -ano | findstr ":3095"
# 有残留就定点杀
Stop-Process -Id <所有占用PID> -Force
# 确认空了再启动
```

## 预防
- 重启任何服务后，验证只有一个进程在目标端口：`netstat -ano | findstr ":PORT"`
- stop + start 之间加 1-2 秒等待，让 socket 完全释放
- 可靠模式：kill → 验证端口空 → 启动 → 验证唯一进程
