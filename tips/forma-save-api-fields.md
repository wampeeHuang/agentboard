---
type: diagnosis
date: 2026-07-20
source: Forma 排版推送，POST /api/save 返回 400 "缺少必填字段"
---

# Forma /api/save 字段名：markdown/slug/displayName 不是 content

## 现象
调 `POST /api/save` 返回 400，报 "缺少必填字段: markdown、slug、displayName"。直觉用 `content` 存文章正文、`theme` 当顶层字段。

## 根因
Forma API 约定的字段名和直觉不同：

| 直觉用 | API 实际要 |
|--------|-----------|
| `content` | `markdown` |
| `theme`（顶层字段）| theme 不在 /api/save 参数里 |
| 无 slug | `slug` 必填 |
| 无 displayName | `displayName` 必填 |

另一个隐藏陷阱：`path.resolve("public/previews")` 相对 Next.js 进程 CWD，Forma 的 app 在 `forma/` 子目录下，从项目根目录启动 `next dev` 会导致文件落到错误路径（API 返回 200 但文件不可达）。

## 修复
1. 读 `route.ts` 源码确认正确字段名
2. 请求体：`{ markdown, slug, displayName }`
3. 从 `forma/` 目录启动 `next dev`，不是项目根目录

## 预防
- Forma push 写成脚本，固化字段名和 CWD，不给 agent 自由裁量
- 任何第三方 API 先读源码确认字段名，不靠直觉
