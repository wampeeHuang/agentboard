---
type: diagnosis
date: 2026-09-23
domain: general
author: dsh-agent
source: AwwO 注册工具架时核对停止链路，实测 ports 数组方案启停安全
---

# 工具架注册 docker 工具：标量 port 会让 Supervisor 按端口 taskkill 打死 Docker 后端

## 现象

给工具架注册 docker compose 型工具（宿主端口由容器发布），点「停止」有打死 Docker Desktop 的风险：宿主端口的 LISTENING 进程根本不是工具自己。

实测本机：`netstat -ano | findstr :8189` → `com.docker.backend.exe`。同一台机上 affine-ce(:3010)、n8n(:5678)、vikunja(:3461) 的宿主端口持有者也都是同一个 com.docker.backend.exe。

## 根因

- `agentboard stopTool` 把停止委托给 Supervisor（`:3097 /api/stop`）；Supervisor 的停止语义是「按端口找监听 PID → `taskkill /F /PID`」（`tryKillPortAsync`）。
- Docker 发布端口时宿主端口的持有者是 Desktop 的转发进程，不是 compose 服务本身 → 按端口杀 = 杀 Docker 后端，连带影响同机所有容器的端口转发。
- Supervisor 只在启动时 `loadManifests()` 接管**带标量 `port` 字段**的 manifest（`if (!m.port || !m.startCommand) continue;`）。所以只要不声明标量 port，它就不接管该服务：`/api/stop` 回 404 `unknown service`，agentboard 回落到本地路径（PID 台账 → `manifest.stopCommand`）→ 跑 `docker compose stop`，安全。

## 修复/步骤

manifest 里端口**只写数组，不写标量**：

```json
{ "ports": [8189], "url": "http://localhost:8189",
  "startCommand": "docker compose --env-file <env> -f <compose> -f <override> up -d",
  "stopCommand":  "docker compose --env-file <env> -f <compose> -f <override> stop" }
```

卡片显示与运行态不受影响（dashboard 用 `t.ports || (t.port ? [t.port] : [])` 取端口；agentboard 的 start/stop 同样先读 ports 数组）。

实测链路：工具架「停止」→ 五容器 `Exited (0)`、8189 释放、`com.docker.backend` PID 不变、同机其他容器不受影响；「启动」→ 端口映射恢复、健康接口 200。

## 预防

- 注册任何「宿主端口由容器/中间进程代持」的工具（docker、代理、端口转发）前，先 `netstat -ano | findstr :端口` 确认持有者；持有者不是本工具进程，就别写标量 `port`。
- 面板里编辑并保存卡片会把 f-port 写回标量 `port`，保存后复查端口字段是否又被改成标量。
- 存量同类卡片（affine-ce、n8n 等）已在 Supervisor 接管状态，点「停止」前先确认端口持有者是谁。
