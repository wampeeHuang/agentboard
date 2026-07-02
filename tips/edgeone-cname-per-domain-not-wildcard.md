# EdgeOne partial 模式必须用每域名专用 CNAME，泛域名导致 SSL 无法签发

type: diagnosis
date: 2026-07-01
source: evopearl.com 全部子域名 SSL 显示 *.cdn.myqcloud.com，微信/夸克打不开

## 现象

- 所有 EdgeOne 加速域名 SSL 证书显示 `CN=*.cdn.myqcloud.com`（EdgeOne 默认证书）
- `ModifyHostsCertificate` 已调，`eofreecert` 已申请，但证书一直是空的
- EdgeOne 控制台显示域名状态正常，HTTPS 配置已开启

## 根因

EdgeOne **partial CNAME 模式**下，每个加速域名有专属 CNAME（如 `7aa4671801d92af7.evopearl.com.acc.edgeonedy1.com.`），不是泛域名格式（`*.evopearl.com.eo.dnse4.com`）。

DNS 填了泛域名 → EdgeOne 无法将流量精准路由到对应域名的源站配置 → 域名所有权验证失败 → 免费证书无法签发 → 回退到默认 `*.cdn.myqcloud.com` 证书。

专用 CNAME 只能通过 API `DescribeHostsSetting` 获取，控制台前端不会直接展示。

## 修复/步骤

1. 调 EdgeOne `DescribeHostsSetting` 获取每个域名的 `Cname` 值
2. 去 DNSPod 把每条 CNAME 记录从泛域名改成专用值（末尾带 `.`）
3. 等待 2-5 分钟，EdgeOne 自动完成域名验证和证书签发
4. `openssl s_client -servername <domain> -connect <domain>:443 | grep subject` 验证证书

## 预防

- EdgeOne 加域名后，**第一件事**用 `DescribeHostsSetting` 拿专用 CNAME，直接填到 DNS
- 不要假设泛域名格式能用——EdgeOne 的 partial 模式和 NS 模式的 CNAME 格式不同
- DNS 填完再申请证书，顺序反了证书发不下来
