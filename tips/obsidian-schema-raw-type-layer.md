# SCHEMA type 合法性分两层——Raw 层比 wiki 层多 3 个扩展类型
type: fact
date: 2026-08-13
source: 误判 D:\Obsidian\Raw\文章 下 type:research 非法，实际是 Raw 层合法类型

## 事实

判断 `D:\Obsidian\SCHEMA.md` 的 type 字段是否合法，不能只看 12 种 wiki 类型（entity / concept / comparison / source / meta / index / 经验 / 方法 / 工具 / 诊断 / 参考 / 理解）。

Raw 层（Raw/ 目录）另有 3 个仅 Raw 合法的扩展类型：

- `novel` — 小说全文存档，不进 wiki
- `book-note` — 书籍摘录/笔记卡片，未达 source 层
- `research` — 调研原始材料（行业/选材/竞品调研），未提炼成 concept/comparison

## 预防

判断 type 合法性前，先确认文件所在层：

- wiki/ 目录 → 只认 12 种 wiki 类型
- Raw/ 目录 → 12 种 + novel / book-note / research 共 15 种

对应 SCHEMA §Raw 层类型扩展（约 119-131 行）。
