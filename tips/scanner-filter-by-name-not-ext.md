# 扫描器按命名约定筛选，不按文件后缀泛扫
type: diagnosis
date: 2026-06-13
source: 技能架构图卡片 — 初版 `/diagrams` 用 `*.html` 泛扫，误收录 skeleton/_base/_footer 等非架构图文件

## 现象

`/diagrams` 页面列出了 8 张卡片：3 个 `system-diagram.html`（架构图）+ 5 个其他 HTML（`skeleton.html`、`skeleton-dark.html`、`_base.html`、`_footer.html` 等）。后者是模板/组件，不是架构图。用户一眼看出"这不是我要的东西"。

## 根因

同一目录下，相同后缀（`.html`）的文件承担不同语义角色。`references/` 里可以放：

- `system-diagram.html` — 系统架构图
- `skeleton.html` — 渲染模板
- `_base.html` — 页面骨架组件
- `_footer.html` — 页面组件

按后缀泛扫无法区分它们。Agent 写扫描器时默认"一个目录 = 一种文件类型"，但真实项目里同名后缀常有多重语义。

## 修复/步骤

扫描条件从 `f.endsWith('.html')` 改为精确匹配 `f === 'system-diagram.html'`。卡片数从 8 降到 3，每张都是架构图。

## 预防

- **目录级收集器必须指定命名约定**，不能只靠后缀。`references/*.html` → `references/system-diagram.html`
- 写扫描器前先 `ls` 目标目录，确认里面有什么文件、各自什么角色
- 如果命名约定尚未建立（如"架构图统一叫 `system-diagram.html`"），先定约定再写扫描器
- 通用原则：**命名即契约**。文件名是唯一能区分同后缀文件不同语义的标识
