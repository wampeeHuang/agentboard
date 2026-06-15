# 公网画廊 iframe 全部 404
type: diagnosis
date: 2026-06-14
source: gallery.evopearl.com 用户反馈"模板都看不到了"

## 现象

公网 `gallery.evopearl.com` 所有模板卡片的 iframe 预览显示 Vercel 404 错误。卡片本身渲染正常（98 个），但 iframe 内的模板内容全部 NOT_FOUND。

## 根因

`manage.js publish` 把 `generated/_index.json` 的模板数据复制到 `published/_index.json` 时，`preview_url` 字段没有改写，仍然指向 `generated/...` 路径。但 `generated/` 在 `.gitignore` 中，不会被推送到 GitHub，Vercel 上也不存在这些文件。

数据流：
```
server.js scan → generated/_index.json (preview_url: "generated/skill/slug/template.html")
  → manage.js publish → published/_index.json (preview_url 未改，还是 "generated/...")
  → git push → Vercel 部署（只有 published/，generated/ 不存在）
  → 浏览器 fetch published/_index.json → 卡片用 generated/ URL 请求 iframe → 404
```

## 修复

1. `manage.js` 发布时自动将 `preview_url` 从 `generated/` 替换为 `published/`（commit `1d1822f`）
2. 新增 `manage.js verify` 命令，推送前校验：preview_url 路径、引用文件是否存在、孤立目录（commit `96653af`）

## 标准化发布流程

```
node server.js --build-only → manage.js diff → manage.js publish --all → manage.js verify → git push
```

verify 必须在 push 前跑，零错误才能推。

## 预防

- 任何涉及 published/ 数据的改动，必跑 `node manage.js verify`
- 不要在 `published/_index.json` 中手动编辑 preview_url
