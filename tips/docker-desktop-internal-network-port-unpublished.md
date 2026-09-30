---
type: diagnosis
date: 2026-09-23
domain: general
author: dsh-agent
source: AwwO 单机部署（D:\tools\awwo，deploy/saas/compose.yml）注册工具架时排查 8189 打不开
---

# Docker Desktop: compose 服务只接 internal 网络时，宿主端口发布被静默跳过

## 现象

Docker Desktop for Windows（Docker 29.4.1 / compose 5.1.3）拉起 compose 服务，ports 写了 `127.0.0.1:8189:8080`：

- `docker compose config` 明确显示 `published: "8189"`、容器事件标签也带 `desktop.docker.io/ports/8080/tcp=127.0.0.1:8189`
- 但 `docker ps` 端口列只有 `8080/tcp`，`docker port` 输出为空，`docker inspect .NetworkSettings.Ports` 是 `{"8080/tcp":[]}`，宿主 `netstat` 里 8189 根本没有 LISTENING
- 容器内部 `docker exec <c> wget -qO- http://127.0.0.1:8080/...` 一切正常，服务本身没病
- 同一台机别的 compose 服务端口发布正常，`docker run -p 127.0.0.1:8190:80` 也正常 → 排除「守护进程整体坏了」

## 根因

该服务唯一接的网络是 compose 里的 `internal: true` 网络。**容器只挂在 internal 网络上时，Docker Desktop 的端口转发拿不到可用路径，宿主端口发布被静默跳过**——up 不报错、不阻塞、不留痕迹。

三组对照实验（同一台机，逐条跑过）：

| compose 网络 | 宿主端口发布 |
| --- | --- |
| 默认 bridge | 正常（netstat 有 LISTENING，curl 200）|
| `internal: true` | **不发布**（无 LISTENING，无 Ports 映射）|
| internal + 另一个非 internal 网络 | 正常 |

## 修复/步骤

不改上游 compose，加一个本地 override，把需要对外发布的服务额外挂到非 internal 网络：

```yaml
services:
  web:
    networks: [private, ingress]
networks:
  ingress:
    driver: bridge
```

`docker compose -f compose.yml -f compose.local.yml up -d`，三件套验证：`docker ps` 出现 `127.0.0.1:8189->8080/tcp`、宿主 `netstat` 有 LISTENING、`curl http://127.0.0.1:8189/` 返回 200。其余服务的 internal 隔离语义不受影响。

## 预防

- 判断「端口到底发布了没有」只看事实：`docker port` / `NetworkSettings.Ports` + 宿主 `netstat`。`compose config` 显示 published 也可能没落地，别拿它当证据。
- 排查顺序固定为「先容器内自证服务健康，再看宿主侧发布」——分不清「服务没起」和「端口没发布」会白查半天。
- 需要出网隔离时，别把唯一网络设成 internal 再指望端口发布：给要发布的服务单独挂一个非 internal 网络即可。
