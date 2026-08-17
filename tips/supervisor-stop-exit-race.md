# Supervisor exit handler 不区分手动停和崩溃，导致 stop→restart 死循环

type: diagnosis
date: 2026-08-04
source: 版式画廊 Agentboard-Supervisor 双控打架排障

## 现象

Agentboard 调用 stopTool 停止服务 → 进程被 kill → 几秒后进程又自动拉起来了 → 端口被重新占用。用户以为"停止失败"，Agent 以为"端口冲突"。

## 根因

Supervisor `onChildExit` 不检查 `entry.status`。停止流程：

```
/api/stop → entry.status = 'idle' → process.kill(pid) → exit 事件
  → onChildExit → scheduleRestart (只检查 status !== 'exhausted')
  → autoStart=true → 重新 spawn → 端口又活了
```

exit handler 没有区分"我手动停的"（idle）和"它自己崩的"（running→dead），一律走重启逻辑。

## 修复

Supervisor `supervisor.js` 三处修改：

1. **exit handler 顶部加 idle 守卫**
```javascript
const entry = services.get(id);
if (!entry) return;
if (entry.status === 'idle') return; // 手动停，不重启
```

2. **scheduleRestart 加 idle 条件**
```javascript
if (s && s.status !== 'exhausted' && s.status !== 'idle') {
```

3. **/api/restart 清空计数器**
```javascript
s.restarts = []; // 手动重启清历史，避免计数器污染导致误判 exhausted
```

## 预防

- 状态机状态变更时，检查所有监听该事件的 handler 是否过滤了不该响应的状态
- exit/stop/restart 三个事件联动时，画状态流转图确认每个转换是预期的
- "5 次失败→放弃"这类计数器逻辑，手动操作入口要清零。只增不减的计数器一定会溢出
