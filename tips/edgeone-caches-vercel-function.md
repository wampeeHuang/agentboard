---
type: diagnosis
date: 2026-07-30
source: evopearl-data 税务确认页面部署
---

# EdgeOne CDN 缓存 Vercel 函数响应

---

## 现象

Vercel 部署成功后，自定义域名（通过 EdgeOne CDN）仍返回旧版函数响应。新代码已部署、Vercel 直接 URL 可能正确，但自定义域名浏览器访问看到旧内容。

## 根因

Vercel 默认给 serverless function 响应加 `Cache-Control: public, must-revalidate, max-age=0`。EdgeOne CDN 对 `max-age=0` 有最小 TTL 覆盖，`public` 指令允许 EdgeOne 缓存。结果：`EO-Cache-Status: HIT`，`Age` 持续增长。

判断方法：
```bash
curl -sI https://your-domain.com/api/endpoint | grep -E "EO-Cache-Status|Age|X-Vercel-Cache"
```
- `X-Vercel-Cache: MISS` + `EO-Cache-Status: HIT` = EdgeOne 缓存在拦截
- 带 query param 的 URL 正常（`?v=1`），裸 URL 返回旧内容 = 确认是 CDN 缓存

## 修复（两步，缺一不可）

### Step 1: 函数代码加 Cache-Control 头

```javascript
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  // ...
}
```

关键：`no-store` 禁止任何缓存，`no-cache` 强制每次回源验证。不用 `public`。

### Step 2: 部署后手动刷新 CDN

EdgeOne 已有缓存不会自动失效，需主动 purge：

```powershell
powershell -File "D:\workspace\evopearl-data\_runtime\purge-edgeone.ps1" "https://your-domain.com/api/endpoint"
```

purge 脚本内部调腾讯云 `CreatePurgeTask` API（teo.tencentcloudapi.com，`zone-3rzfhqg01rpj`），凭证在 `edgeone-creds.json`。

## 预防

- 所有 Vercel 函数响应加 `no-cache, no-store` 头（对实时数据函数尤其重要）
- 部署脚本 `deploy.ps1` 里加 purge 步骤
- 带 query param 的 URL 天然绕过——功能链接（如 `/api/confirm?item=X`）不受影响
