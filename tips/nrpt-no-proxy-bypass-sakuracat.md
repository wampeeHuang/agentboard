# NRPT + NO_PROXY：双绕代理访问国内 API
type: method
date: 2026-07-21
source: DeepSeek API 代理故障——SakuraCat/Vortex 代理到 DeepSeek TLS 握手断裂，CONNECT 返回 200 但 SSL 失败

## 问题

代理（Clash Meta/SakuraCat）能建立 CONNECT 隧道（返回 200），但后续 TLS 握手失败：`schannel: failed to receive handshake, SSL/TLS connection failed`。代理到目标 API 的上游路由断裂。

代理的 fake-ip DNS 劫持是网络层所有流量的入口。必须分两步绕过：DNS 解析绕过 + TCP/TLS 连接绕过。

## 步骤

### 第一层：DNS 绕过（NRPT，需管理员）

让 Windows DNS Client 对特定域名走公共 DNS 直出，不走代理 fake-ip：

```powershell
# 管理员 PowerShell
Add-DnsClientNrptRule -Namespace ".\api.deepseek.com" -NameServers @("223.5.5.5","119.29.29.29") -Comment "DeepSeek API"
ipconfig /flushdns
```

验证（必须用 Resolve-DnsName，不用 nslookup）：
```powershell
Resolve-DnsName api.deepseek.com
```

### 第二层：TCP/TLS 绕过（NO_PROXY，不需要管理员）

设置环境变量让应用层绕过代理直连目标：

```powershell
[Environment]::SetEnvironmentVariable("NO_PROXY", "...,api.deepseek.com", "User")
```

**NRPT 只解决 DNS，NO_PROXY 只解决连接路由。两者必须配合。只设其中一个 = 无效。**

## 为什么不用 hosts

hosts 优先级高于 NRPT。hosts 中的 IP 过期后 NRPT 完全被覆盖，无声失效。而且 hosts 需要手动维护 IP，IP 一变就断。NRPT 走 DNS 服务器实时解析，永远拿到最新 IP。

## 查看/维护

```powershell
Get-DnsClientNrptRule | Format-Table Name, Namespace, NameServers, Comment
```

新域名受影响时复用同一模式：
```powershell
Add-DnsClientNrptRule -Namespace ".\<域名>" -NameServers @("223.5.5.5","119.29.29.29")
```

## 预防

- 不要往 hosts 写 API 域名的静态 IP——hosts 优先级高于 NRPT，会覆盖
- SakuraCat 订阅推送每次完整覆写 config.yaml，此方案不依赖 config.yaml 所以不受影响
- 代理本身到目标 API 的 TLS 问题未解决——此方案是绕过代理，不是修代理
