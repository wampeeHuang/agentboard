---
type: method
domain: general
author: claude
date: 2026-09-04
source: 灵感图库工具图标更新：manifest.icon 只是 emoji 兜底，矢量定制图需注册 TOOL_LOGO
---

# 工具架自定义矢量图标：注册 TOOL_LOGO 并放入 web/shared/logos

## 适用条件

某个工具在 Agentboard 行内想用矢量图（SVG 品牌 mark）代替 emoji 图标；manifest 的 `icon` 字段只能存单个 emoji 字符，放不进 SVG。

## 步骤

1. 做一张小画布 SVG（参考现有惯例约 `viewBox="0 0 20 20"`、圆角 4–5、品牌色），放入 `C:\Users\Administrator\.agentboard\web\shared\logos\<tool-id>.svg`。
2. 打开 `C:\Users\Administrator\.agentboard\web\_script.js`，在文件顶部 `var TOOL_LOGO = { ... };` 里给该工具 id 加一条映射：`'<tool-id>': '/shared/logos/<tool-id>.svg'`（先例：`capability-map`）。
3. 保存后无需重启 Agentboard：静态 SVG 与 `_script.js` 均按请求现读。
4. 刷新工具架页面看到新图标。manifest 里的 emoji 保留作无自定义图时的兜底，不用删。

## 预防

- 先核对 `TOOL_LOGO` 的键是工具 `id`（不是 name）。
- 小尺寸可读性优先：20px 画布下避免太细的线条与复杂图形，优先实心几何与高对比色。
- 如果该工具另有 Web UI，把同款 mark 同步到应用侧栏 logo 与 favicon，避免两套图标。
