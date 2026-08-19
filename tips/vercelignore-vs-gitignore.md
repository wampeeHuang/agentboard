---
type: diagnosis
date: 2026-07-14
source: Forma 部署时发现本地文章目录 public/previews/ 被上传到 Vercel
---

# .vercelignore 独立于 .gitignore — Vercel CLI 上传本地文件

## 现象

`.gitignore` 里已经写了 `/public/previews/`，但 `vercel --prod` 仍然把该目录上传到 Vercel。

## 根因

Vercel CLI 直接从本地文件系统读取并上传文件，不经过 git。`.gitignore` 只告诉 git 忽略哪些文件，Vercel CLI 不读它。

`.vercelignore` 才是 Vercel CLI 的排除规则，语法同 `.gitignore`，但独立生效。

## 修复

项目根目录加 `.vercelignore`：
```
public/previews/
```

## 预防

- 部署到 Vercel 的项目，只要有不希望上传的本地文件（文章草稿、大文件、密钥），必须同时写 `.gitignore` 和 `.vercelignore`
- 两套规则相互独立——.gitignore 管 git，.vercelignore 管 vercel CLI
