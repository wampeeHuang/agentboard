# Cron 错误无分类导致 27 次重试烧光 credits
type: diagnosis
date: 2026-06-13
source: 进化猫三个日报 cron job（3cfba668/591346bc/a85e2d4c）全部陷入重试风暴，2.5 小时内触发 27 次只有 5 次成功

## 现象

三个日报定时任务按 07:30/08:00/08:30 触发，首发全部超时。之后自动化重试风暴：
- a85e2d4c 在 2h 内重试 11 次
- 3cfba668 重试 8 次
- 591346bc 重试 8 次
- 欠费后（402 Insufficient Balance）仍继续重试 7 次
- API 恢复后有两个 job 因 runningAtMs 锁未清除仍无法执行
- 最终全部通过 sessions.send/create 绕过 cron 锁才完成

## 根因

五条独立问题叠加：

1. **错误无分类** — timeout、network error、402 billing 全部走相同的 backoff 逻辑。billing error = 永远不会成功，但系统当成"暂时失败等下再试"
2. **无重试上限** — 没有单窗口 maxRetries 机制。一个 API 故障可以连续烧几个小时
3. **runningAtMs 锁只在超时时清除** — 3 秒 error 退出的 run，锁照样卡 600 秒。API 恢复了 cron 却无法调度
4. **cron.run 绕过 backoff** — 手动排查时连续调用 cron.run，consecutiveErrors 从 4 推到 7，backoff 从 5min 变成 1h
5. **无 token 预算** — 每次重试都消耗 tokens，没有 per-job per-window 上限

这五条不是独立的——它们叠加形成了"死亡螺旋"：API 抖动 → 超时重试 → 加剧 API 负载 → credits 加速消耗 → 欠费后继续重试 → lock 卡住恢复路径 → 手动排查火上浇油。

## 修复

### 立即可做（不改网关代码）

1. **Pre-flight check** — 每个 cron prompt 最前面加 API 可达性检查，curl 测一次 0 token，不可达就终止
2. **timeoutSeconds 600→480** — 成功的 run 都在 50-500s 之间，600s 太长
3. **maxConcurrent 4→2** — 降低峰值并发，减少 token 消耗速率

### 需网关代码改动

4. **错误分类**: billing(402)/auth(401)→permanent, 立即停止; timeout/network→transient, 现有 backoff
5. **runningAtMs 在 error 时清除** — 不等 timeoutSeconds
6. **单窗口 maxRetries=3** — 超过后跳到下一个 scheduling window
7. **cron.run 显示 backoff warning** — 让操作者知情，不盲目 bypass

## 预防

- 新 cron job 上线前过 checklist：pre-flight 有吗？timeoutSeconds ≤ 480？单窗口重试上限？
- 每次 API 故障后不急着 cron.run——先 `curl -s -w "%{http_code}" https://api.deepseek.com/v1/models` 确认 API 可达
- 欠费是最后一张多米诺骨牌，但第一张是 API 抖动+无错误分类
- sessions.create / sessions.send 是绕过 cron lock 的有效逃生舱
- 操作日志在 `~/.agentboard/tips/`，不在 `_runtime/`
