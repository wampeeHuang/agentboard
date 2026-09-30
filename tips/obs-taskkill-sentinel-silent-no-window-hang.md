---
type: diagnosis
date: 2026-08-31
domain: general
author: claude
source: OBS 注册工具架 + 全面汉化 2026-08-31
---

# OBS taskkill /f 强杀残留 .sentinel 哨兵 → 下次启动静默卡死无窗口

## 现象
OBS 用 taskkill /f /im obs64.exe 强杀后，下次启动不再弹窗口。进程存在但 ~90MB，日志文件只有 50 字节（"Crash or unclean shutdown detected"），无任何 UI，看似"没启动"。

## 根因
OBS 启动时在 %APPDATA%\obs-studio\.sentinel\ 写 run_<uuid> 崩溃哨兵文件，正常退出时删除。taskkill /f 强杀来不及清理 → 哨兵残留。下次启动 OBS 误判上次崩溃，进入不可见的崩溃恢复流程（静默卡死，无窗口）。

## 修复
启动前清哨兵。agentboard start.cmd 内置：
```cmd
del /q "%APPDATA%\obs-studio\.sentinel\run_*" 2>nul
```
startCommand 指向这个裸 .cmd 文件路径（node spawn cmd /c <裸路径> 不受内联字符串嵌套引号改写影响，报"拒绝访问/语法不正确"）。

## 预防
- OBS 停止命令勿用 taskkill /f，优先 taskkill /PID <pid> /T /F 优雅退出
- 必须强杀时，下次启动前清 .sentinel/run_*
- start.cmd 里的 del 哨兵行勿删
