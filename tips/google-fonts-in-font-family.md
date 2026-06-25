# font-family 中的 Google Fonts 名称在国内永远不会加载

type: diagnosis
date: 2026-06-25
source: SOLUTION_TOC.html 准备离线演示，发现全篇用 Geist/Instrument Serif 但从未加载

## 现象

HTML 中 CSS 和 inline SVG 大量使用 `font-family: 'Geist', ...` / `'Geist Mono', ...` / `'Instrument Serif', ...`，但 `<head>` 中没有 Google Fonts `<link>` 标签。字体从未加载，浏览器一直回退到系统默认字体。

在中国大陆，即使有 `<link>` 标签也会被 GFW 封锁导致白屏（见 `gfw-blocked-external-resources.md`）。

## 根因

`font-family` 属性只声明"我想用这个字体"，不负责加载。字体加载需要单独的 `<link>` 或 `@font-face`。写了名字但不加载 = 永远回退。

## 修复

自包含 HTML 文件应使用系统字体栈，不依赖 CDN 字体：

| 角色 | 替换为 |
|------|--------|
| 标题 serif | `'Noto Serif SC', 'STSong', 'SimSun', serif` |
| 正文 sans | `'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif` |
| 等宽 mono | `'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace` |

## 预防

- 面向中国用户的 HTML，字体栈从系统字体开始，不依赖外链
- 要演示/拷走的 HTML，确保离线可用：`grep -r "fonts.googleapis\|fonts.gstatic\|Geist\|Instrument" *.html` 应无命中
