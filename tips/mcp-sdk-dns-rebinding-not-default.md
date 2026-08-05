# MCP SDK DNS rebinding 保护默认关闭，allowedHosts 必须含端口号
type: diagnosis
date: 2026-08-05
source: agentboard MCP stdio→Streamable HTTP 升级，安全配置踩坑

## 现象
`@modelcontextprotocol/sdk` StreamableHTTPServerTransport 启动后，正常 Host header `127.0.0.1:3099` 被拒绝，返回 `Invalid Host header`。

## 根因
两个坑叠加：
1. **`enableDnsRebindingProtection` 默认 `false`** — SDK >= 1.24.0 有 DNS rebinding 保护（CVE-2025-66414/66416，CVSS 8.1），但默认关闭。不显式设 `true` = 裸奔
2. **`allowedHosts` 不含端口号** — HTTP Host header 带端口（`127.0.0.1:3099`），但文档示例只写 `['127.0.0.1', 'localhost']`，不带端口匹配不上

## 修复
```js
new StreamableHTTPServerTransport({
  enableDnsRebindingProtection: true,
  allowedHosts: ['127.0.0.1', 'localhost', '127.0.0.1:3099', 'localhost:3099'],
  enableJsonResponse: true,
  sessionIdGenerator: undefined  // stateless
});
```

## 预防
- 任何 MCP Streamable HTTP 部署必须显式设 `enableDnsRebindingProtection: true`
- `allowedHosts` 加端口号变体
- 加上 Host header 校验中间件（SDK 的 DNS rebinding 保护只做基础检查）
