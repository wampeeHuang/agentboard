---
type: fact
date: 2026-08-14
source: 重写 Design Token 笔记，tag 从「设计令牌」改成「Design Token」（带空格），Obsidian 显示红色+删除线
---

# Obsidian frontmatter tag 不能含空格——带空格 tag 显示红色划掉

## 事实

Obsidian frontmatter 的 `tags` 值只能是单个词：字母、数字、下划线 `_`、连字符 `-`、斜杠 `/`。含空格或特殊字符的 tag 会被 Obsidian 判为非法，渲染成红色 + 删除线（看起来像失效，但数据还在 YAML 里）。

多词 tag 正确写法：用连字符连接，如 `Design-Token`、`Design-Token`（不能 `Design Token`）。

## 预防

写 frontmatter tags 时：
- 英文多词 → 连字符：`Design-Token`，不是 `Design Token`
- 中文 tag 无空格，直接写：`标准化`、`网页复现`
- 存疑时先想"Obsidian 一个 tag = 一个词"，空格即断词

对应 D:\Obsidian 的 tag 合法性最终由 `wiki/scripts/check.js` 从 SCHEMA 解析校验，但空格问题是 Obsidian 渲染层先暴露的，不等 check.js。
