# hosts 优先级高于 NRPT，nslookup 测不出来
type: diagnosis
date: 2026-07-21
source: DeepSeek API 代理故障——三层故障链排查，hosts 过期 IP 静默覆盖 NRPT 真实 DNS

## 现象

API 域名 TCP 连接超时。DNS 层加过 NRPT 规则绕过代理 fake-ip，但连接仍然失败。nslookup 返回正确 IP，但实际连接走到错误的旧 IP。

## 根因

Windows 域名解析优先级：**hosts > NRPT > DNS Server**

hosts 中有 `14.205.93.53 api.deepseek.com`（过期 IP），NRPT 虽然配置了正确的 DNS 服务器，但 hosts 在更高优先级，NRPT 从未生效。连接走到旧 IP，超时。

**nslookup 的陷阱**：nslookup 绕过 Windows DNS Client，直接查 DNS Server。测不出 hosts 和 NRPT 的效果。正确验证工具是 `Resolve-DnsName`（走完整的 Windows DNS Client 优先级链）。

## 修复

1. 删除 hosts 中的过期条目
2. `ipconfig /flushdns`
3. `Resolve-DnsName api.deepseek.com` 验证返回正确 IP

## 预防

- DNS 故障排查第一步：检查 hosts 文件。hosts 中的静态绑定是最隐蔽的 DNS 劫持源
- 验证 DNS 只用 `Resolve-DnsName`，不用 `nslookup`
- hosts 中任何硬编码 IP 条目都应标注用途和写入时间，定期检查是否过期
