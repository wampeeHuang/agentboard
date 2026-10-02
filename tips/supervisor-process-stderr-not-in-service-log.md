---
type: diagnosis
date: 2026-10-02
domain: general
author: dsh-agent
source: script-editor 会话：两个 500 在服务日志里查不到 traceback，停下服务前台重跑才抓到 NameError 与 401
---

# 由工具架/守护启动的后台服务，stderr 不落盘——排查 500 别只看日志文件

## 现象

本地服务（`service.py`，由工具架托管后台启动）连续出现两个 500：

- 一个真因是 `NameError: name 'CloudConflict' is not defined`（写了 `except CloudConflict` 却没导入）；
- 另一个是云请求 401（token 过期）被抛成内部错误。

两种情况前端都只显示「服务内部错误，请查看本机服务日志后重试」，而**`_runtime/logs/service.log` 里都没有对应的新 traceback**——

- 关于 `NameError` 那次：尝试用 PowerShell 把 stdout/stderr 重定向到调试文件**一直为空**，说明该进程的 stderr 根本没被那个文件接住；
- 关于 401 那次：`service.log` 里最新的 traceback 是几小时前另一件事的残留，**看起来像"没有新错误"，实际错误发生了**。

**这条最危险的地方**：日志文件"没有新错误"会被读成"服务端没报错"，于是转而去怀疑凭证、数据、前端——排查方向整体跑偏。

## 根因

项目自身有"异常固化到日志"的代码（`traceback.print_exc()` + 文件 handler），但当服务由外部守护（工具架 / supervisor / nohup 风格）拉起时，**stdout/stderr 的归属由父进程决定**：父进程若不接管道也不重定向，输出就丢进虚空，或只留在某个不易发现的临时文件里。项目内部的日志 handler 与进程的 stderr 是两条独立通道，前者配好了不代表后者有落点。

## 修复/步骤

**排查时不要依赖"看日志文件"，改为自己接管输出：**

```powershell
# 1) 先停掉托管进程（走托管方自己的停止接口，或按端口找 PID）
$c = Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force }

# 2) 前台/重定向重跑，把 stderr 抓到已知文件
Start-Process -FilePath <python> -ArgumentList "service.py","--no-browser","--port","<port>" `
  -RedirectStandardOutput "_runtime\dbg-out.txt" -RedirectStandardError "_runtime\dbg-err.txt" -WindowStyle Hidden

# 3) 复现那一个请求
curl.exe -s -X POST -H "Content-Type: application/json" -d "{}" "http://127.0.0.1:<port>/<path>"

# 4) 直接读 dbg-err.txt
Get-Content "_runtime\dbg-err.txt" -Tail 30
```

本例正是这样才拿到 `NameError: name 'CloudConflict' is not defined` 与 `RuntimeError: 网站授权已失效`——两者此前在日志文件里完全不可见。

## 预防

- **判定"服务端有没有报错"不能只看日志文件**；先确认该进程的 stderr 到底流向哪里（`Get-CimInstance Win32_Process` 看父进程与命令行，或直接前台重跑对照）。
- 托管启动与手工启动的**可观测性不等价**：托管方便，但排障时要主动降级为手工前台跑。
- 复现时用**同一台机器、同一个端点、同一个请求体**，只改启动方式，才能把"日志缺失"和"错误不存在"区分开。
- 项目侧加固方向：把异常写进**自己打开的文件**（不依赖 stderr），并在健康接口暴露最近一条错误。
