# execSync 阻塞事件循环导致 HTTP 超时

type: debug
date: 2026-07-31
source: Supervisor 面板 10s+ 超时排查

## 现象
- Node.js HTTP 服务器端口在监听，连接能建立
- 但 `curl` 返回 `000`（无 HTTP 状态码），0 字节内容
- `/api/status`（小响应）偶尔 2-6s 延迟，`/`（大 HTML）稳超时
- 进程未崩溃，`Get-NetTCPConnection` 显示端口在 `LISTEN` 状态

## 根因
`child_process.execSync` 在 setInterval 回调中调用。execSync 阻塞事件循环直到子进程退出。阻塞期间：
- `http.createServer` 的请求回调无法执行
- `res.end()` 的数据停留在 TCP 缓冲区，永远不会 flush
- 从客户端看：连接建立（内核 TCP 握手完成），但从未收到响应

具体路径：`checkResources()` 每 10s 串行调用 5 个 execSync（typeperf ×3, PowerShell ×1, nvidia-smi ×1），每个 ~1.2s。合计 ~5s/10s 阻塞 = 50% 时间不可用。

## 修复
1. 所有 execSync → `child_process.exec` 异步封装：
```javascript
function execAsync(cmd, timeout) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, encoding: 'utf8', windowsHide: true }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}
```
2. 周期性任务用 `setTimeout` 链式（从完成起算间隔），不用 `setInterval`（防堆积）

## 预防
- Node.js HTTP 服务器中禁止 `execSync` / `spawnSync`。用异步版本
- 必须 sync 时：限单次调用、设置 timeout、确保不在请求路径或高频定时器中
- 诊断方法：`time curl` 逐个端点测响应时间 + 单独测 execSync 命令耗时
