---
type: method
date: 2026-07-21
source: 德城 landing page 部署上线，dechpcba.evopearl.com EdgeOne SSL 配置排障
---

# EdgeOne CNAME 接入域名 SSL 免费证书必须走手动四步，eofreecert 自动模式静默失效

## 现象

- EdgeOne `ModifyHostsCertificate` 调 `Mode: eofreecert`（自动申请+部署免费证书）
- API 返回 `{Response: {RequestId: ...}}` —— 看起来成功了
- 但实际上 HTTPS Switch 仍然是 `off`，证书未申请，边缘节点仍服务 `CN=*.cdn.myqcloud.com`（EdgeOne 默认证书）
- 没有任何错误提示

## 根因

EdgeOne 的 `eofreecert` 自动模式只对 **NS/DNSPod 托管接入** 的站点有效。对于 **CNAME 接入** 的站点（evopearl.com 所有子域名都是），EdgeOne 无法自动完成域名所有权验证，必须走手动流程。

API 接受了 `eofreecert` 请求但静默跳过了证书申请步骤 —— 返回 200 但不执行。

## 修复/步骤

CNAME 接入域名的 SSL 免费证书必须走四步手动流程：

### Step 1: 申请证书 + 获取验证信息

```
Action: ApplyFreeCertificate
Params: ZoneId, Domain, VerificationMethod: "dns_challenge"
```

返回：
```json
{
  "DnsVerification": {
    "Subdomain": "_dnsauth.dechpcba",
    "RecordType": "CNAME",
    "RecordValue": "dechpcba.evopearl.com.eoacme2.com"
  }
}
```

### Step 2: 配置 DNS 验证记录

在 DNSPod（或其他 DNS 服务商）创建 CNAME 记录：
- 名称：`_dnsauth.{子域名}`（如 `_dnsauth.dechpcba`）
- 类型：CNAME
- 值：Step 1 返回的 RecordValue

等 Google DNS 确认解析生效后再继续。

### Step 3: 验证

```
Action: CheckFreeCertificateVerification
Params: ZoneId, Domain
```

成功返回含 `CommonName` 字段。失败返回 `FailedOperation.ApplyCertDnsVerificationFailed`（DNS 记录未传播到 EdgeOne 检查点，等 1-2 分钟重试）。

### Step 4: 部署证书

```
Action: ModifyHostsCertificate
Params: ZoneId, Hosts: ["域名"], Mode: "eofreecert_manual"
```

成功后：
- API `DescribeHostsSetting` 的 HTTPS Switch 变为 `on`
- 边缘节点约 5 分钟后开始服务新证书
- `openssl s_client -servername <域名> -connect <EdgeOne IP>:443` 验证

## 预防

- EdgeOne 加域名后，**先确认接入模式**：NS 托管 → 可用 `eofreecert` 自动模式；CNAME 接入 → 直接走手动四步
- 不要用 API 返回的 CertInfo 判断证书状态——`DescribeHostsSetting` 的 CertInfo 经常是空的，即使证书已在服务
- 验证证书部署成功的唯一可靠方式：`openssl s_client` 直接看边缘节点返回的 subject CN
- 腾讯云国际站 API 端点：`teo.tencentcloudapi.com`，版本 `2022-09-01`
