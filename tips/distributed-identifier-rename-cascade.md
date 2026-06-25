# 分布式常量反模式：重命名需同步 N 个文件，漏一个断链

type: anti-pattern
date: 2026-06-25
source: evopearl-data "每日选题" → "每日精选" 重命名

## 现象

重命名一个数据分类（如"每日选题"→"每日精选"），在 UI 改完以为完成了，但数据产出断链——Agent 写文件到旧路径、调度器检查旧路径、网站找不到新数据。

## 根因

同一个标识符 `daily-selection` / `daily-picks` / `每日选题` 散落在 3 层共 4 个文件中，没有单一真相源：

| 文件 | 字段 | 旧值 | 作用 |
|------|------|------|------|
| `config.json` | `tasks.daily-selection.label` | "每日选题" | 网页 tab 标签 |
| `jobs.json` | `output.path` | `daily-picks` | 调度器产出路径 |
| `gate-daily-selection.md` | `DATA_TYPE` | `daily-picks` | Agent 写文件目录 |
| `gate-daily-selection.md` | `LOG_FILE` | `daily-picks` | Agent 写日志文件名 |

改了 label 但漏了 `DATA_TYPE` → Agent 写到不存在的 `data/daily-picks/` → 落盘失败。
改了 `DATA_TYPE` 但漏了 jobs.json 的 path → 调度器 verifyOutput 找错目录 → output_missing。
全改对了但漏了 jobs.json 的 kind → stdout 不触发 git push。

三个 bug 全是同一个重命名操作的连锁反应。

## 识别信号

如果回答"这东西叫什么名字"需要查超过 1 个文件，就已经中了反模式。典型症状：
- grep 同名常量出现在 3+ 个文件里
- 改一个名字需要跨文件修改
- 文件 A 的值和文件 B 的值必须一致但没人保证

## 修复（治标）

重命名后的检查清单：
1. 全局 grep 旧名称，逐条确认
2. 每改一处，验证对应链路（Agent 写→调度器验→git push→deploy→curl 200）
3. 不要假设"改了 A 就自动同步 B"

## 预防（治本）

在项目里建一个常量文件作为单一真相源，其他文件引用它：

```json
// constants.json
{ "dataTypes": { "dailySelection": { "id": "daily-selection", "label": "每日精选", "dataDir": "daily-selection" } } }
```

或者至少在 CLAUDE.md 中记录"涉及重命名时需要同步的文件清单"。

对于调度器侧，output.path 已支持 `YYYY-MM-DD` 变量，如果再加一个 `{{DATA_TYPE}}` 模板变量由调度器统一注入，就不需要在 prompt 模板里再写一遍路径了。
