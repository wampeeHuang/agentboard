# Vercel 两个项目绑同一域名，部署成功但线上不走新代码
type: diagnosis
date: 2026-07-02
source: gallery.evopearl.com 修 Google Fonts → 部署到 layout-gallery 项目 → 线上仍残留旧内容

## 现象
- `npx vercel --prod --yes` 部署成功，deployment READY
- Vercel 源站 URL（`xxx.vercel.app`）访问正常，新代码生效
- 自定义域名（经过 EdgeOne CDN → Vercel `cname.vercel-dns.com`）仍返回旧内容
- `X-Vercel-Cache: HIT`，EdgeOne 缓存刷新无效

## 根因
Vercel 上两个项目（例：`skill-html-showcase` 和 `layout-gallery`）都绑了同一个自定义域名。Vercel 的路由不保证最新部署的项目胜出——旧项目可能抢走域名流量。部署到新项目成功，但域名实际路由到的还是旧项目的最后一次部署。

## 修复/步骤
```bash
# 1. 查哪些项目绑了这个域名
TOKEN=$(cat ~/.vercel/config.json | jq -r .token)
curl -s "https://api.vercel.com/v9/projects?domain=GALLERY.EVOPEARL.COM" \
  -H "Authorization: Bearer $TOKEN" | jq '.projects[].name'

# 2. 从旧项目移除域名
curl -s -X DELETE \
  "https://api.vercel.com/v9/projects/{OLD_PROJECT_ID}/domains/GALLERY.EVOPEARL.COM" \
  -H "Authorization: Bearer $TOKEN"

# 3. 加到正确项目
curl -s -X POST \
  "https://api.vercel.com/v9/projects/{NEW_PROJECT_ID}/domains" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"GALLERY.EVOPEARL.COM"}'
```

## 预防
- 域名迁移时：先从旧项目删域名 → 再加到新项目。不要只加不删
- 部署后验证自定义域名（不只是 vercel.app 源站 URL）——源站正常 ≠ 自定义域名正常
- 怀疑路由问题时：`curl -sI https://DOMAIN` 看 `X-Vercel-Id` 的 region 前缀，跟源站 URL 对比判断是否同一部署
