---
type: diagnosis
date: 2026-08-27
source: tools 表单 schema 驱动改造 — 下拉枚举 8 vs schema 10、runtime 7 vs 10，手写副本与契约漂移
---

# 表单下拉枚举手写副本 → 与 schema 契约漂移

## 现象

表单里分类下拉、运行时下拉的选项数，和契约 schema 的枚举数对不上。tools 表单改造时实测：

| 下拉 | 手写副本选项数 | schema 枚举数 |
|------|--------------|--------------|
| 分类 category | 8 | 10（缺 工作区 / 公开站） |
| 运行时 runtime | 7 | 10（缺 rust / ruby / java） |

看起来下拉能用、能选，但新建工具永远选不到新分类。schema 加了值，表单不跟进。

## 根因

表单下拉的选项列表是**第二份手写副本**，没从契约 schema 派生。schema（`lib/manifest-schema.js` 的 `CATEGORY_VALUES` / `FIELD_RULES.runtime`）是唯一真相源，但前端 `web/_script.js` 里又写了一遍 `CATEGORY_LIST` / `RUNTIME_LIST`。两处不同源，改 schema 的人不记得改前端副本 → 漂移。

副本是隐形契约：不报错、不警告，只是静默少选项。比报错更危险——报错有人修，少选项没人知道。

## 修复/步骤

**治根因：表单从 schema 派生渲染，删手写副本。**

1. 在 schema 文件导出字段契约：`TOOL_FIELDS`（含 `options` 直接指向 schema 枚举）+ `CATEGORY_OPTIONS` / `RUNTIME_OPTIONS`
2. 加 REST 端点把契约吐给前端：`GET /api/tools/schema` → `{ fields, formTypes, categoryValues, runtimeValues }`
3. 前端 `renderFieldHtml` 按 `f.options` 渲染下拉，**不再硬编码选项数组**
4. 删掉 `CATEGORY_LIST` / `TYPE_LIST` / `RUNTIME_LIST` 等手写副本
5. 验证：schema 枚举数 == 前端下拉渲染出的选项数（用 DOM 数 option）

## 预防

- 表单字段、下拉枚举、必填标记——**一律从 schema 派生**，任何副本都是漂移点
- 改 schema 枚举时，跑一遍 `#audit` 或数一下渲染出的 option 数量
- 字段副本和 schema 枚举数不一致 = 静默腐化信号，直接改 schema 驱动
