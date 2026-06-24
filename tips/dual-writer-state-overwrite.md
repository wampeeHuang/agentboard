# 双模块写同一 state 文件，API 修改被 tick 静默覆盖
type: diagnosis
date: 2026-06-24
source: scheduler 仪表盘三个任务异常无法通过 API reset 清除

## 现象
- `/api/cron/reset/:id` 返回 302 重定向，看起来成功
- 直接读 `scheduler-state.json` 文件，修改确实写入了
- 但 60 秒内文件内容恢复原样，异常状态纹丝不动
- API 返回的 state 和文件内容在短时间内来回变化

## 根因
scheduler.js 和 server.js 各自维护独立的 `loadState()` / `saveState()` 函数，读写同一个文件：

- **scheduler.js**：维护模块级 `var state` 对象，每 60 秒 `tick()` → `saveState()` 把内存 state 写回磁盘
- **server.js**：API 端点调自己的 `loadState()` 读磁盘 → 修改 → `saveState(state)` 写磁盘

竞争序列：
```
1. API reset: loadState() 读磁盘 → 改 → saveState() 写磁盘 ✓
2. scheduler tick: saveState() 把自己的内存 state 写磁盘 → 覆盖 API 的修改 ✗
```

API 改的是磁盘文件，scheduler 改的是自己的内存 state——磁盘是它们之间的隐式通信通道，而 scheduler 总是最后说话的那个。

这和 `double-serverjs.md`（同一文件两个路径副本）不同——这里是同一文件、同一路径、但两个写者各自持有自己的内存副本。

## 修复
方案 A（已实施）：桥接——给 scheduler.js 加 `setResetFunction()`，传给 server.js。API reset 直接改 scheduler 的内存 state，绕开文件竞争。

方案 B（长期）：收敛为单写者。scheduler.js 是 state 的唯一主人，server.js 只读。API 想改 state 必须通过 scheduler 暴露的函数。

## 排查方法
当怀疑双写者竞争时：
```bash
# 1. 读文件
node -e "console.log(require('fs').readFileSync('state.json','utf-8'))"

# 2. 读 API
curl http://localhost:3100/api/...

# 3. 如果两个返回不一致 → 有多个写者
```

## 预防
- state 文件只有一个模块写，其他模块通过它暴露的函数间接修改
- 看到 Node.js 项目里有多个 `fs.writeFileSync(STATE_PATH)` 调用 → 警觉
- `require` 同一模块 ≠ 共享同一 `var state`——每个 `require` 有自己的闭包
