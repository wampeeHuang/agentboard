---
type: diagnosis
date: 2026-07-22
source: 德城 landing page 部署，EdgeOne 回源 cname.vercel-dns.com 导致无缓存节点回源失败，用户无法访问
---

# cname.vercel-dns.com 是 Vercel DNS 服务，不是托管端点——EdgeOne/CDN 回源必须用 Vercel 部署域名

## 现象

- EdgeOne 服务正常，HTTPS/DNS 配置正确
- 部分用户/网络能访问，部分不能
- 我是海外代理能打开，深圳移动用户打开超时（>6000ms）
- EdgeOne 缓存 HIT 时正常，MISS 时失败
- 直接 curl EdgeOne CDN IP 能拿到缓存内容

## 根因

`cname.vercel-dns.com` 是 Vercel 的 DNS 服务域名，不是 Web 托管端点。当 EdgeOne（或其他 CDN）用 `cname.vercel-dns.com` 作为回源地址时：

- 已经缓存了内容的 CDN 节点：直接返回缓存，不受影响
- 没有缓存的 CDN 节点：回源请求到 cname.vercel-dns.com → Vercel 无法路由到正确的部署 → 返回 Forbidden 或 DEPLOYMENT_NOT_FOUND

老域名（已部署数天）的 CDN 节点都有深度缓存，所以一直正常。新域名（刚部署几小时）的节点无缓存，立刻暴露问题。

## 修复

EdgeOne 回源地址从 `cname.vercel-dns.com` 改为 Vercel 部署直连域名：

```
旧：cname.vercel-dns.com（Origin Host: dechpcba.evopearl.com）
新：dechpcba-landing-28l17lrzn-camellia3hs-projects.vercel.app
```

使用 EdgeOne API：`ModifyAccelerationDomain`（国际站 teo.tencentcloudapi.com 2022-09-01）

```python
{
    'ZoneId': 'zone-xxx',
    'DomainName': 'dechpcba.evopearl.com',
    'OriginInfo': {
        'OriginType': 'IP_DOMAIN',
        'Origin': 'dechpcba-landing-28l17lrzn-camellia3hs-projects.vercel.app'
    }
}
```

## 次因：Vercel 缓存头 max-age=0

Vercel 返回 `Cache-Control: public, must-revalidate, max-age=0`。EdgeOne 配 FollowOrigin（默认）时不会独立缓存，每次请求都回源。大文件（视频、图片）加载慢。

修复：EdgeOne `ModifyZoneSetting` 关 FollowOrigin，开自定义 Cache（3600s+）：

```python
{
    'ZoneId': 'zone-xxx',
    'CacheConfig': {
        'Cache': {'Switch': 'on', 'CacheTime': 3600},
        'FollowOrigin': {'Switch': 'off'},
        'NoCache': {'Switch': 'off'}
    }
}
```

## 预防

- 所有 Vercel 部署的 CDN 回源地址必须用 Vercel 部署域名（`*.vercel.app`）或已验证的自定义域名，**禁止**用 `cname.vercel-dns.com`
- 新域名部署后，从不同网络（海外、中国大陆）验证可达性
- "我能打开"不等于"用户能打开"——CDN 节点级缓存差异可以掩盖回源故障数天
- EdgeOne 的 `DescribeOriginList` API 可以查看当前回源地址：`OriginData[].Origin`
- 其他 evopearl.com 子域名目前仍用 cname.vercel-dns.com——靠缓存撑着，需逐个修复
