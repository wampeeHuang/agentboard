# SakuraCat 非正常关机后 DNS 劫持残留导致全网断连
type: diagnosis
date: 2026-07-03
source: 重启后全网断连，排查发现 SakuraCat DNS/代理配置残留

## 现象
- 电脑重启后所有程序无法上网（浏览器、飞书、终端均不通）
- 换手机热点无效——热点网卡 DNS 同样被劫持
- Windows 网络诊断报 "DNS 服务器未响应"
- 系统日志大量 DNS 超时（doh.pub, dns.alidns.com, feishu.cn 等）
- `nslookup` 任何域名都超时

## 根因
SakuraCat 系统代理模式通过 `sysproxy.exe` 做了两件事：
1. 将**所有活动网卡**的 DNS 服务器硬改为 `127.0.0.1`
2. 将 WinHTTP 代理设为 `127.0.0.1:7897`

正常退出 SakuraCat 时会恢复这些设置。但 Windows 关机/重启时直接杀进程，SakuraCat 没有机会恢复，配置残留在系统里。

重启后 SakuraCat GUI 自动启动，但 Vortex/Clash 内核可能启动失败（端口冲突、cloud cache 损坏等），导致 DNS 指向 `127.0.0.1` 却无服务应答 → DNS 死循环 → 全网瘫痪。

## 修复/步骤

**立即修复（3 步，需管理员权限）：**
```
# 1. 清空所有网卡静态 DNS
Get-NetAdapter | Set-DnsClientServerAddress -ResetServerAddresses

# 2. 清 WinHTTP 代理
netsh winhttp reset proxy

# 3. 刷新 DNS 缓存
ipconfig /flushdns
```

桌面已放 `fix-network.bat`（自动提权），双击运行即可。

## 预防
- 关机前：右下角任务栏右键 SakuraCat → 退出，等 3 秒再关机
- 排查辅助：Cloud cache 损坏（`.cloud_cache.*.store.json` 仅 3B）会导致内核反复重启，删掉即可
- 检查点：`Get-DnsClientServerAddress` 看是否有网卡 DNS = 127.0.0.1
