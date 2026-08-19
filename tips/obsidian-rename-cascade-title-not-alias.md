---
type: diagnosis
date: 2026-08-19
source: Obsidian 知识库 6 本英文书名改中文，改名后 wikilink 断链、index 残留已删实体卡
---

# Obsidian 改名后 wikilink 断链：title 字段不参与链接解析，只有 aliases 会

## 现象

改 Obsidian 笔记文件名后，wikilink 断链、index.md 残留旧条目、封面图 404。单点 `mv` 完以为改完了，实际漏了四五处。

## 根因

1. **frontmatter `title` 字段不参与链接解析**。Obsidian 的 wikilink 只匹配（a）文件 basename（b）`aliases` 数组。`title: "字体的技艺"` 写了也不会让 `[[字体的技艺]]` 解析到 `《字体的技艺》Robert Bringhurst.md`。新手最反直觉——以为 title 就是链接名。
2. **改名是级联操作**，至少 6 处联动：文件名、frontmatter `title`、H1、`![cover](assets/xxx)` 路径、正文/相关书籍里的 wikilink、派生视图（index 生成器产物）。漏一处就断链，且 doctor 不一定立刻报。

## 修复

1. 先查 SCHEMA 的 type↔directory 映射再动手——新内容落 raw 源层还是 wiki 提炼层，别用"书籍=实体"的训练直觉猜。
2. 改名走脚本（文件名映射表 + 6 处联动），不手工逐个 Edit 漏改。
3. wikilink 用全文件名 `[[《中文名》作者]]`，或给文件加 `aliases: [中文名]` 才能用短名 `[[中文名]]`。
4. 改完重跑 `rebuild-index.js` + `check.js` + `doctor.js`，派生视图重新生成，不手改 index.md。

## 预防

- 接"建书/建笔记/改名"任务 → 先 `grep SCHEMA.md` 查层归属 + 命名规则
- "删除"指令指代不明 → 先 `ls` + 列清单确认范围，不把索引/派生视图当冗余删
- 中文书名翻译 → 先 WebSearch 查官方译名，不自己造（无官方版标注社区译名/暂无中文版）
- 改名后自检清单：文件名 / title / H1 / cover 路径 / 双向 wikilink / index 重建
