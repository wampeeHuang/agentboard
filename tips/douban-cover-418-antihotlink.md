---
type: diagnosis
date: 2026-08-19
source: Obsidian 书籍笔记封面本地化（《藏书·家》尼娜·弗洛登伯格）
---

# 豆瓣封面 418 反盗链：换 OpenLibrary covers 封面 API

## 现象
下载豆瓣图书封面 URL（`img*.doubanio.com/.../sXXXXXX.jpg`）返回 `HTTP 418`，封面本地化失败。curl 不带 header 直接 418，带普通 UA 仍 418。

## 根因
豆瓣图片 CDN 反盗链，非浏览器环境（无正确 Referer/Cookie）一律 418，不是网络问题也不是 URL 失效。豆瓣没有公开的稳定封面直链。

## 修复/步骤
1. 放弃豆瓣封面直链，改用 **OpenLibrary Covers API**：`https://covers.openlibrary.org/b/id/{cover_i}-L.jpg`（`-L` 大图，`-M` 中图）
2. 拿 `cover_i`：OpenLibrary 搜索页（`openlibrary.org/search.json?q={书名}`）返回的 `cover_i` 字段，或直接用 ISBN 查 `openlibrary.org/isbn/{isbn}.json`
3. 备选：Google Books thumbnail（`books.google.com/books/content?id={id}&printsec=frontcover&img=1&zoom=2`）——注意 Google Books 可能返回 PNG 但 URL 写 .jpg，下载后验魔数
4. 下载后本地引用 `assets/{书名}.{ext}`，md 里 `![cover](assets/xxx)`，不再留豆瓣外链

## 预防
- 书籍封面本地化，豆瓣 URL 一律跳过（418 是常态），直接走 OpenLibrary 或 Google Books
- 下载后跑魔数校验定扩展名（JPEG `FF D8 FF` / PNG `89 50 4E 47`），别信 URL 扩展名
