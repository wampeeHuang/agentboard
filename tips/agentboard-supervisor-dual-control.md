---
type: diagnosis
date: 2026-08-04
source: 版式画廊启停割裂——Supervisor 显示运行中，Agentboard 启动报端口冲突
---

# 双进程管理器打架：Agentboard 和 Supervisor 各自 spawn/kill 同一进程

## 现象

Supervisor :3097 显示服务 running。Agentboard :3099 工具架同服务显示 stopped。Agentboard 点启动 → "端口已被占用"。Agentboard 点停止 → 进程被杀 → Supervisor 立刻拉起来 → 端口又活了。

两边信息永远不一致，操作互相抵消。

## 根因

双进程主人架构：Agentboard `startTool` spawn 进程写 PID 文件，Supervisor `start()` 也 spawn 进程写自己的内部 Map。两者互不知晓，各自管理同一个服务。

```
Agentboard stopTool → kill PID → Supervisor onChildExit → autoStart=true → restart
Agentboard startTool → spawn → 端口被 Supervisor 拉的进程占了 → fail
```

这不是 bug 叠加，是架构层面权力不统一。

## 修复

启停权归 Supervisor 唯一权威。Agentboard 变成配置源 + 指令中介。

Agentboard `lib/tool-registry.js`：
- `startTool` → curl Supervisor `/api/restart` → 轮询端口确认 → 返回
- `stopTool` → curl Supervisor `/api/stop` → 轮询端口释放 → 清理 PID → 返回
- Supervisor 不可达时 fallback 本地 spawn/kill（兜底，不主用）

## 预防

- 同一资源（进程、端口、文件）只能有一个管理器。两个管理器 = 迟早打架
- 做架构决策时先问：这个资源的主人是谁？如果答案是两个，重来
- 守护进程和应用管理面板的关系只能是：面板发指令，守护执行。不能各自执行
