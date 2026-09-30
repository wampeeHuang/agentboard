---
type: diagnosis
date: 2026-09-22
domain: general
author: dsh-agent
source: 部署 Vikunja 时 docker pull 全失败，逐个排查出口与国内镜像站
---

# docker.io 拉不动：不是镜像站选错，是代理节点死了 + 镜像站 blob 落在境外 CDN

## 现象

`docker pull vikunja/vikunja:latest` → `failed to do request: ... EOF`，换 `hello-world` 同样 EOF。主机 curl 到 registry-1.docker.io 直连与走代理都是 000。

逐个试国内镜像站：

| 镜像站 | 结果 |
|---|---|
| docker.1ms.run | manifest 拿到了，blob 拉取 EOF |
| docker.m.daocloud.io / 1panel.live / hub.rat.dev / dockerproxy.net / docker.xuanyuan.me | 000，不通 |
| docker.nju.edu.cn | 403 |
| 华为 SWR `ddn-k8s` | 要求登录（无匿名 token） |
| 阿里云 ACR | 匿名 401 |

## 根因

三层叠加，逐层排除才看清：

1. **出口层**：SakuraCat/Vortex 的「节点选择」指向的节点已死——core 日志 `dial 节点选择 (match Match/) ... error: z1.ioioioioioio.com:41138 connect error: i/o timeout`。国内域名走 DIRECT 规则所以照常能上，只有境外流量全断。Clash 控制口 `127.0.0.1:39798` 未监听，没法用 API 换节点。
2. **镜像站层**：`docker.1ms.run` 的 manifest 在国内（120.233.3.4，curl 302），但 blob 被重定向到 `cloudfront-docker-cf.mrs.1ms.run`（Cloudflare 104.17.x）；`docker.m.daocloud.io` 的 blob 在 `image-mirror.r2.daocloud.vip`（Cloudflare R2）。**这台机器上 Cloudflare 不可达 → 「镜像站在国内」不等于「镜像拉得动」**。判断一个镜像站能不能用，看它的 blob 落在哪，不是看 `/v2/` 是否返回 401。
3. **DNS 层**：默认解析器把 registry-1.docker.io 解析成 31.13.95.48（Facebook 段的 fake-ip）。这只是表象——代理活着时这个假 IP 照样通（流量走 TUN/代理），代理死了真 IP 也白搭。

## 修复/步骤

1. 先测出口，一条命令定性（401 = 通，000 = 不通）：

```
curl.exe -s -o NUL -w "%{http_code}" -x http://127.0.0.1:7897 https://registry-1.docker.io/v2/
```

2. 不通就别在镜像站上继续耗——换站救不了出口。等代理节点恢复或请用户换节点；本例约 20 分钟后自愈，同一批 12 次探测全部 200，随后 `docker pull` 一次成功（镜像 + postgres 都拉下来了）。
3. 想长期不依赖代理：给 Docker Desktop 配 host proxy（`192.168.31.203:7897`）或可用的 registry-mirror，改完必须重启引擎（会连带重启所有容器）。

## 预防

- 拉镜像失败先跑一次出口探测，再谈镜像站——顺序反了会白折腾十几分钟
- 别把 `Resolve-DnsName` 拿到的 fake-ip 当故障判据：代理活着假 IP 也能通，代理死了真 IP 也不通
- 「镜像拉不动」是出口问题、不是 Docker 问题；同一条判据对 pip / npm / go mod 一样成立
