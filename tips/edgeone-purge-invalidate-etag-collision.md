---
type: diagnosis
date: 2026-08-19
source: forma.evopearl.com 全站 HTML 返回 1 字节 "<"，静态文件正常
---

# EdgeOne 缓存截断响应，invalidate 刷新被 ETag 碰撞 304 卡死

## 现象

forma.evopearl.com（EdgeOne CDN → 源站 Vercel）所有 HTML 路由（`/`、`/docs`、`/view`）返回 1 字节 `<`（`Content-Length: 1`，body = 0x3C，即 `<!DOCTYPE html>` 被截到第一个字符）。`llms.txt` / `openapi.json` 等静态文件正常。同部署、直连 Vercel 的 `forma-typesetting.vercel.app` / `forma.blackcamellia.xin` 返回 129064 字节正确。

## 根因

三层因果链：

1. **EdgeOne 过度缓存**：站点 `CacheConfig.FollowOrigin.Switch = off` + `CacheTime = 3600`，无视源站 Vercel 的 `Cache-Control: public, max-age=0, must-revalidate`，把 HTML 强制缓存 3600 秒。
2. **截断响应被缓存**：某次部署/网络抖动期间，EdgeOne 从 Vercel 拉到截断的 1 字节响应（流只写了第一个 `<` 就断了），连完整响应头 + ETag 一起缓存。
3. **ETag 碰撞 + invalidate 死循环**（核心非显然点）：Vercel prerender 的 `ETag` 是**部署级**不是内容级——1 字节截断响应和完整 129KB 内容带同一个 `ETag`（本例 `c4cefa82`）。`CreatePurgeTask` 默认 `Method: invalidate` 是软刷新：EdgeOne 用 `If-None-Match` 回源校验 → ETag 相同 → Vercel 返回 `304 Not Modified` → EdgeOne 继续用截断缓存。改内容 + 重部署也没用，因为新 ETag 跟着截断响应一起被重新缓存。

## 修复/步骤

`CreatePurgeTask` 显式加 `Method: "delete"`（硬删缓存，强制全量回源，**不走 If-None-Match**），替代默认 `invalidate`：

```python
from tencentcloud.teo.v20220901 import teo_client, models
req = models.CreatePurgeTaskRequest()
req.ZoneId = "zone-xxx"
req.Type = "purge_host"
req.Targets = ["forma.evopearl.com"]
req.Method = "delete"   # 关键：默认 invalidate 被 304 卡死
client.CreatePurgeTask(req)
```

验证：`curl -H "Accept-Encoding: identity" https://域名/` 看 `Content-Length` 是否从 1 变回 129064。海外 PoP 秒级生效，中国路由 PoP 有 5~15 分钟传播延迟，别用本地 curl 一条断言没修好——用外部视角（WebFetch）交叉确认。

## 第二层：delete 后仍 1 字节（Vercel hkg1 区域截断）

`Method: delete` 硬删后 EdgeOne 正确 MISS 回源，但 **Vercel 香港边缘 hkg1** 仍回 1 字节：`Content-Length: 1`、`X-Vercel-Id: hkg1`、`X-Vercel-Cache: PRERENDER`，ETag 是全量内容哈希。同部署同 ETag 走 `forma.blackcamellia.xin`（直连 Vercel，无 EdgeOne）命中 **hnd1** 返回 129064 字节完整。`vercel redeploy`（新 ETag `126797…`）后 hkg1 依旧 1 字节；identity/gzip/br 三种编码均 1 字节，排除 EdgeOne 压缩。

即 1 字节分两层：① EdgeOne 缓存（delete 已修）；② Vercel 边缘 PRERENDER 缓存污染。**根因不是区域级基础设施，是 forma 是唯一 Next.js SSG 站点**——响应头带 `X-Nextjs-Prerender: 1`（gallery/data/vivihuang 等站点均无此 header，动态渲染），SSG 的 prerender 输出被 Vercel 边缘缓存，hkg1 那份缓存某次污染成 1 字节。`vercel redeploy`（新 ETag）不刷新边缘 prerender 缓存，所以换部署也无效。这就是"其他网站都不会，只有 forma 坏"的原因：只有 forma 走 SSG 边缘缓存。

## 第三层：修复（force-dynamic 根治）

Vercel hkg1 的边缘 prerender 缓存无法从外部硬删（无对应 purge API），改代码根治：给受影响的三个 SSG 路由 `/`、`/docs`、`/view` 加 `export const dynamic = "force-dynamic"`，让 Vercel 不再边缘缓存 HTML，每次动态渲染完整内容。

```tsx
// app/page.tsx / app/docs/page.tsx / app/view/page.tsx 顶部
export const dynamic = "force-dynamic";
```

流程：改三处 → `vercel --prod`（build 输出确认 `/docs` `/view` 从 `○ Static` 变 `ƒ Dynamic`）→ EdgeOne `Method: delete` 硬删缓存（否则 3600s 内仍回旧 1 字节）→ 验证。结果：`/` 128951B、`/docs` 45751B、`/view` 16940B，全部 200 完整。

**性能代价可忽略**：渲染本身 0.18ms（6 个主题 JSON 共 24KB，纯 fs 读）。force-dynamic 额外延迟 = Vercel 冷启动 ~1s + 回源往返，但被 EdgeOne `CacheTime=3600` 缓存吸收——终端命中缓存秒回，慢只在每 3600s 一次的缓存 MISS。到不了分钟级。

## 预防

- EdgeOne `CacheConfig.FollowOrigin.Switch` 改 `on`，让 EdgeOne 尊重源站 `max-age=0`（HTML 不缓存），从根上避免截断响应被缓存 3600 秒。静态资源自有 cache header 不受影响。**只挡第一层（EdgeOne 缓存），第二层（Vercel 边缘 PRERENDER）需 force-dynamic 根治。**
- **Next.js SSG 站点挂 Vercel 时，Vercel 会边缘缓存 prerender 输出（`X-Vercel-Cache: PRERENDER`），且无 purge API 可硬删**。若该缓存被污染，`vercel redeploy` 也清不掉。需要动态行为时用 `force-dynamic` 或 ISR，别依赖 SSG 边缘缓存可自愈。
- 排查 CDN 缓存类问题先分清**软刷新（invalidate，走 304 校验）vs 硬删（delete，全量回源）**，遇到"刷新了还不变"先怀疑 ETag 碰撞。
- CDN 前面还叠着 Vercel 时，缓存问题要分两层查：CDN 缓存（delete 可清）vs 源站 Vercel 边缘（delete 清不掉）。用直连源站的另一域名（如 `*.blackcamellia.xin`）交叉比对，定位截断在哪一层。
