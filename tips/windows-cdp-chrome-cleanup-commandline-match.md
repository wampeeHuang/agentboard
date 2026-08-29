---
type: method
date: 2026-08-24
source: 字荐改版会话 — taskkill //F //IM chrome.exe 反复报"进程不存在", 实际 chrome 还占着 9223 端口
---

# Windows 清理 CDP headless Chrome: taskkill 不可靠 → Get-CimInstance 按 CommandLine 匹配

## 现象

用 `--remote-debugging-port=9223 --user-data-dir=...cdp-profile` 启动 headless Chrome 做 CDP 验证后, `taskkill //F //IM chrome.exe` 清不掉, 反复报 `ERROR: The process "chrome.exe" with PID xxxx could not be terminated` / 进程不存在, 但 9223 端口仍被占, 下次起 Chrome 失败或连到旧实例。

## 根因

`taskkill //IM chrome.exe` 按进程名匹配所有 chrome.exe——Windows 上 Chrome 常驻后台/会话隔离的实例与 CDP 实例混杂, 匹配到的是用户会话进程(无权限杀), 而真正该杀的 cdp-profile 实例因同名被 `//IM` 语义漏掉或报错。按名字批量杀既危险(可能误杀正常浏览器)又低效(杀不干净)。

## 修复/步骤

按**启动命令行特征**精确匹配目标实例, 只杀我们启动的那批:

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'cdp-profile' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

- 匹配串用启动时 `--user-data-dir` 里的唯一目录名(如 `cdp-profile`), 不会误伤正常 Chrome
- headless Chrome 在最后一个 tab 关闭后通常自退出, 但 ws 断开残留时用上面命令兜底
- 杀完用 `Get-NetTCPConnection -LocalPort 9223` 确认端口释放再重启

## 预防

- 每次 CDP 会话结束固定跑清理命令, 不留残留
- 端口被占时先查占用进程命令行, 确认是自家 cdp-profile 再杀, 不 `taskkill //F //IM chrome.exe` 无差别扫射
