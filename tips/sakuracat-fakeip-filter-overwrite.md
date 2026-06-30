# SakuraCat 推送配置静默覆盖 fake-ip-filter，国内服务断连
type: diagnosis
date: 2026-06-30
source: 飞书客户端断连（第二次复发）+ DeepSeek API (codex-relay) 502

## 现象
- 飞书 IM 长连接卡死，无法收发消息
- codex-relay 调 DeepSeek API 返回 502
- `nslookup feishu.cn 127.0.0.1` 返回 `198.18.0.x`（假 IP），而非真实 IP
- 浏览器上网正常，代理规则里 `DOMAIN-SUFFIX,cn,DIRECT` 看起来没问题

## 根因
SakuraCat（Electron GUI 前端）推送配置到 Vortex Clash 内核时，**会覆盖 `config.yaml` 中的 `fake-ip-filter` 列表**。用户手动加的白名单域名在下次推送后丢失，导致目标域名的 DNS 被 fake-ip 劫持到 198.18.0.1/16。

虽然 `DOMAIN-SUFFIX,cn,DIRECT` 规则让流量走直连，但 DNS 解析阶段就已经返回了假 IP——直连假 IP 当然连不上。

**为什么之前修好又复发：** SakuraCat 每次启动或订阅更新时都会重新推送配置，覆盖本地修改。修好只能撑到下次推送。

## 修复
三步，顺序不能乱：
1. 打开 `C:\Users\Administrator\.config\com.vortex.helper\config.yaml`，搜目标域名，不在 `fake-ip-filter` 中就补上
2. 关 SakuraCat → 删同目录 `cache.db`
3. 重启 SakuraCat
4. 验证：`nslookup <目标域名> 127.0.0.1` 应返回真实 IP

**当前 fake-ip-filter 白名单（2026-06-30）：**
```
feishu.cn / +.feishu.cn / feishucdn.com / +.feishucdn.com
bytedance.com / +.bytedance.com / byteoversea.com / +.byteoversea.com
api.deepseek.com / +.api.deepseek.com
```

> 白名单唯一真相源在 `~/.agentboard/tools/sakuracat-proxy/manifest.json` → `whitelist` 数组。恢复时优先读 manifest，tip 里的列表是快照可能过期。

## 预防
- 不要用 hosts 文件硬编码 IP 绕过——fake-ip-filter 是治根，hosts 是打补丁
- 任何国内服务出现"能 ping 通但连不上"或"DNS 返回 198.18.x.x"→ 先查 fake-ip-filter
- SakuraCat 更新订阅后如果之前能用的服务突然断了 → 直奔 config.yaml 看 fake-ip-filter 有没有被覆盖
