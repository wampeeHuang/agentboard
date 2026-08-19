---
type: method
date: 2026-08-09
source: Obsidian wiki Agent工程重写——Skill 架构模式.md H1 是"AI 项目文件架构六大范式"
---

# 文件名-H1-title 三统一

## 现象

Obsidian `[[link]]` 按文件名解析，渲染时显示 H1 标题。文件名和 H1 不一致时，读者点开看到不同标题，困惑"我到底打开了什么"。

例：`[[Skill 架构模式]]` → 打开页面 H1 显示"AI 项目文件架构六大范式"。读者不确定是不是点错了。

## 根因

重命名文件时只改了文件名（`mv`），没同步改 frontmatter `title` 和 H1。三处各自独立，Obsidian 不做校验。

## 修复

重命名三步：
1. 改文件名
2. 改 frontmatter `title` 字段
3. 改 H1 标题
4. 全局搜索 `[[旧名]]`，替换所有交叉引用

## 预防

可加 check.js 规则：frontmatter `title` ≠ H1（去空格）→ WARN。entity 页豁免（人名常有标点变体）。
