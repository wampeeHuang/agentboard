---
type: fact
date: 2026-07-25
source: dechpcba.evopearl.com GEO 优化
---

# llms.txt —— AI 爬虫的内容目录

## 现象

DeepSeek 等 AI 工具访问网站时"只看首页"，子页面（如 /knowledge 知识库）全部漏掉，描述也不完整。网站有大量专业内容但 AI 不知道。

## 根因

AI crawler 默认只爬首页，不深入子页面。需要一份结构化"目录"告诉 AI 网站包含哪些页面、每个页面讲什么。

`llms.txt` 是 `robots.txt` 的 AI 版——放在网站根目录，Markdown 格式，列出所有页面 + 简短描述 + H2 分组。AI 工具请求 `llms.txt` 即可获得整站地图。

## 格式

```markdown
# 站点名称
> 一句话描述

## 分组 1
- [Page Title](URL) — 一句话描述
- ...

## 分组 2
- ...
```

## 修复

- 根目录新建 `llms.txt`
- 列 10-30 个 URL，按 H2 分组
- 每个链接带一句话描述
- 覆盖首页 + 知识库 + 关键功能页

## 预防

新建网站：`llms.txt` 与 `robots.txt`、`sitemap.xml` 同时创建，属于 GEO 地基三件套。
