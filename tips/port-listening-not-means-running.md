# 工具假活：端口 LISTENING ≠ 进程在跑
type: diagnosis
date: 2026-07-02
source: codex 502 Bad Gateway，工具架显示 running=true 但 relay 实际没跑

## 现象
- agentboard 工具架显示某工具 `running: true`
- 实际调用该工具返回 502 / 连接拒绝
- `netstat -ano` 显示端口 LISTENING，但 PID 对应的进程名不是该工具
- 或者端口根本不在 LISTENING，但工具架显示 running

## 根因
agentboard 的 running 判断仅靠端口检测——端口 LISTENING 即报告运行中。以下场景都会造成假阳：
1. **进程崩溃但端口滞留** — 进程已死，端口处于 TIME_WAIT 未释放
2. **端口被其他进程占用** — 保洁阿姨开了灯（另一个程序碰巧绑了同端口）
3. **netstat 命令本身失败** — `catch(_){}` 静默吞错误，缓存了过期状态
4. **启动即报成功** — spawn 返回 ok 但进程可能立刻崩溃，未等端口就绪

2026-07-02 已修复：tool-registry.js 已加入 tasklist 进程交叉验证 + startTool 端口轮询。但非 Windows 平台仍只有端口检测；无法解析进程名的工具（如 node 类）仍回退到端口检测。

## 诊断步骤
遇到"工具架说 running 但工具不可用"时，手动验证三步：
```
# 1. 端口真的在监听吗？
netstat -ano | findstr ":4446.*LISTENING"

# 2. 监听者是对的工具吗？
tasklist /FI "PID eq <上面拿到的PID>"

# 3. 如果端口在但进程不对 → 假活。杀掉占端口者，重启工具
taskkill /F /PID <PID>
```

## 预防
- 工具架已修复：端口检测 + 进程交叉验证，减少假阳性窗口
- 非 Windows / 无法解析进程名的工具仍是盲区，遇到假活走上面三步手动排查
