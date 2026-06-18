# Chrome DevTools MCP 锁——残留进程持有 profile 导致"browser already running"
type: diagnosis
date: 2026-06-18
source: MCP session 异常结束后，Chrome DevTools MCP 全部工具返回 "The browser is already running" 错误

## 现象
- Chrome DevTools MCP 所有工具（take_snapshot、navigate_page 等）调用失败
- 返回错误：`The browser is already running for C:\Users\Administrator\.cache\chrome-devtools-mcp\chrome-profile`
- MCP server 状态显示正常，但工具不可用

## 根因
上一次 MCP session 的 Chrome 进程没有退出，仍然持有 `--user-data-dir` 下的 lockfile。
MCP session 结束时 Chrome 进程不保证会被清理，session 异常终止（超时、崩溃、手动 kill）时尤其容易残留。
新 session 启动时检测到已有 Chrome 实例占用同一 profile，拒绝连接。

关键：**问题不在 lockfile 文件本身**，而在持有锁的进程。删 lockfile 无效——文件被进程持有，删不掉或删了也没用。

## 修复

定位并杀掉持有 chrome-devtools-mcp profile 的 Chrome 进程：

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" `
  | Where-Object { $_.CommandLine -like '*chrome-devtools-mcp*' } `
  | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

验证已清理：
```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" `
  | Where-Object { $_.CommandLine -like '*chrome-devtools-mcp*' }
```
返回空 = 已清理。之后重试 MCP 工具即可恢复。

## 无效方案（不要试）

| 操作 | 为什么无效 |
|------|-----------|
| 删除 profile 目录下的 `lockfile` | 进程持有文件句柄，删不掉 |
| 删除 `DevToolsActivePort` | 不解决问题，Chrome 还在跑 |
| 重命名 profile 目录 | `拒绝访问`，同样被进程持有 |
| `taskkill /F /IM chrome.exe` | 杀掉所有 Chrome，用户自己打开的标签页也会丢——太粗暴 |
| 重启 CefSharp 相关进程 | 无关进程，chrome-devtools-mcp 用的是独立的 Chrome |

## 预防
- MCP session 异常结束后，检查是否有残留 chrome-devtools-mcp 进程
- 不要假设 MCP session 结束 = Chrome 进程已退出
- 此问题会反复出现，每次异常终止都可能触发——不是一次性修复
- **MCP 截图/浏览器操作期间，不要手动打开 Chrome 操作同一页面**——两双手同时在方向盘上，即使不触发 lockfile 冲突，也会导致页面状态不可预测。MCP 干活时你看着就行
