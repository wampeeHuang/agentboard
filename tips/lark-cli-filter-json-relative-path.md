# lark-cli --filter-json 相对路径 + lookup 静默失败

type: reference
date: 2026-08-01
source: decheng-landing-page 定价引擎迁移 Phase 5 验证

## 现象
`lark-cli base +record-list --filter-json @D:\absolute\path\filter.json` → `invalid file path` 报错。
改用相对路径后不报错，但 filtered 结果始终为 0 条（silent fail）。

## 根因
1. `--filter-json` 只接受**当前工作目录下的相对路径**（如 `./filter.json`），不接受绝对路径。提示：`--file must be a relative path within the current directory`。
2. `--filter-json` **对 lookup 字段无效**。filter 条件指向 lookup 字段时不报错，静默返回 0 条记录。

## 修复
1. 脚本开头 `os.chdir(os.path.dirname(__file__))` 切换到脚本所在目录，然后用相对路径 `"filter.json"` 传递。
2. 需要按 lookup 字段过滤时，拉全量数据在 Python 内存中用 `defaultdict` 分组。不要依赖 `--filter-json`。

## 预防
lark-cli 的 filter 能力有限。复杂过滤场景（lookup 字段、多条件 OR）直接走 Python 端处理，把 API 当 dumb pipe 用。
