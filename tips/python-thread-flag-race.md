# Python daemon thread 设 flag 停止 — 线程在 IO 阻塞中不会检查
type: diagnosis
date: 2026-06-15
source: WeChat 抓取 — Stop 后启动新任务，两个线程抢同一个 state dict 导致 fetched 计数跳跃

## 现象
调用 stop API（`state["running"] = False`）后立即启动新任务，出现两个线程同时写 `state` 字典：旧线程的 `fetched` 从 438 继续增长，新线程的 `fetched` 从 0 开始增长，日志中间歇出现两个序列的数值。

## 根因
`threading.Thread(target=fetch_thread, daemon=True).start()` + `state["running"] = False` 的停止模式有竞态窗口：

1. 旧线程在 `httpx.get()` 阻塞中，设 flag 后不会立即感知
2. 新 `start_fetch` 重置 `state["running"] = True`，此时旧线程还没检查 flag
3. 旧线程 IO 返回后检查 flag——但 flag 已被新线程重置为 True
4. 两个线程同时读/写同一个可变 dict，没有任何同步原语

本质：`daemon=True` 只在线程退出时生效，`flag` 是协作式停止，**在阻塞 IO 期间不会被检查**。

## 修复/步骤
1. 启动新任务前，先确认旧线程已退出：`old_thread.is_alive()` 检查
2. 或用 `threading.Event` 替代 `state["running"]` bool——Event 在 IO 返回后会立即被检查
3. 更稳健：每个任务用独立的 state 字典，不复用
4. 最稳健：用 `concurrent.futures.ThreadPoolExecutor` + `Future.cancel()`

## 预防
- 任何"设 flag + 启新线程"的模式，先确认旧线程已退出再重置状态
- daemon thread 不是银弹——它只保证进程退出时不阻塞，不保证任务安全终止
- 两个操作共享可变状态时，永远假设最坏时序：旧操作还没结束，新的就已经开始了
