---
type: capability
tool: vercel-deploy skill
scenario: 新项目要上线/已有项目要更新，需要知道有什么部署渠道
date: 2026-07-21
recipe: ~/.claude/skills/vercel-deploy/SKILL.md
---

# Vercel 静态网站部署管线（camellia3hs-projects scope）

## 能力

通过 `vercel-deploy` skill 将纯静态网站部署到 Vercel，DNS 走 Cloudflare。5 步管线：识别项目 → 外部资源审查+vercel --prod → 边缘直达验证 → 外网验证 → DNS+SSL。

## 为什么只能用这个

| 方案 | 为什么不行 |
|------|-----------|
| Netlify | 本机无 Netlify 凭证，无 token 配置 |
| Cloudflare Pages | 本机未配置 Wrangler token |
| Vercel 其他 scope | 本机 token 绑定 `camellia3hs-projects`，不认其他 scope |

本机已有 Vercel token（`~/.vercel/config.json`）+ Cloudflare DNS 管理 evopearl.com。唯一已配置凭证且验证通过的部署渠道。

## 速查

```
项目 .project 文件声明 deploy.pipeline="vercel-deploy"
→ 读 skill SKILL.md
→ npx vercel --prod --yes --token <TOKEN> --scope camellia3hs-projects
```
