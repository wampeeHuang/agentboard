---
type: method
date: 2026-08-21
source: vivi-harness 删 6 个 design token，残留散在 SVG/HTML/CSS 五处
---

# 删 CSS token 前 grep 全项目文件类型，删后再次 grep 归零

## 现象
vivi-harness 删 6 个纯 CSS 色 token（paper-deep/cloud-white/pink-soft/coral/orange/blue），只改了 design.md + tokens.css。自认为改完，一 grep 还有残留引用散在 **5 处**：agentos.css（5 处 paper-deep）、apps.css（orange）、brand-kit.html（多个色板/翻转列表）、brand-kit.css（2 处 paper-deep）、sprite.svg（coral/orange/blue）。

## 根因
删 token 时只想到"CSS 层"，漏了三类隐性引用方：
1. **SVG sprite** 可引用宿主页面 CSS 自定义属性（`var(--coral)`），而 SVG 常被当成独立资源忽略。
2. **设计文档页**（brand-kit.html 这类配色盘点页）逐字记录 token 值。
3. **孤儿 CSS**（无人引用的品牌样式表）仍含旧 var()。

## 步骤
删除或改名任何 CSS token，走闭环：

```
1. grep 全项目所有引用方，不只 *.css：
   rg -n "var\(--<token>\)" --glob "*.{css,html,js,svg,json,md}" 项目目录
2. 逐个处理：改引为存留 token / 删引用块 / 删孤儿文件（先确认无人引用）
3. 删除后再 grep 一次，结果为零才算清干净
4. 跑构建/门禁脚本（如 check.js）确认出口 0
```

## 预防
- 删 token 的爆炸半径永远比直觉大一层：CSS 之外还有 SVG、设计文档、孤儿文件。
- "改完了"的唯一判据是二次 grep 归零，不是"我记得都改了"（同 `feature-removal-dead-doc-clearance`）。
