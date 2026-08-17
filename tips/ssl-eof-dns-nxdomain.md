# SSL EOF 先查 DNS，不修证书
type: diagnosis
date: 2026-07-20
source: gpt-image-2 生图，Python requests 调 aigoapi 报 SSLError UNEXPECTED_EOF_WHILE_READING

## 现象
`SSLError: UNEXPECTED_EOF_WHILE_READING`，多次重试一致。直觉反应是证书链问题、TLS 版本不匹配、或不信任自签证书。

## 根因
旧域名 `api.aigoapi.com` 已废弃，DNS 解析返回 NXDOMAIN。Python `requests` 在 DNS 失败后，SSL 握手读到 EOF，底层库把 DNS 失败包装成了 SSL 错误——表面是 SSL 问题，根因是域名不存在。

## 修复
1. `nslookup api.aigoapi.com` → Non-existent domain
2. 读到代码硬编码了旧域名，`config.yaml` 写的是正确端点 `aigoapi.com`（无 `api.` 前缀）
3. 用正确端点 + 代理 `http://127.0.0.1:7897` + `verify=False` 立即通

## 预防
- SSL 报错第一步永远是 `nslookup` 查域名存在性，不是修证书链
- API 端点不从代码读，从 config.yaml 读——代码里写死的是过期缓存
- DNS NXDOMAIN → SSL EOF 是 Python requests 的已知误导模式，记住这个因果链
