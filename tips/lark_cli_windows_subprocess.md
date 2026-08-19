---
type: method
date: 2026-07-15
source: O1 纪录片管线 Feishu bitable 建表入库
---

# lark-cli Windows subprocess JSON 传递三坑

## 坑1: subprocess 内联 JSON → Windows shell 转义炸

**现象**: Python `subprocess.run` 传 `--json '{"fields":[...],"rows":[["11分钟",...]]}'` → `'11分钟' is not recognized as an internal or external command`

**根因**: `.cmd` 文件通过 `cmd /c` 执行，JSON 内的特殊字符被 cmd 二次解析。

**修复**: 用 `@file` 模式，JSON 先落盘再引用：
```python
tmp_path = os.path.join(cwd, "_tmp.json")
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)
# subprocess.run 中传 --json @_tmp.json
# 注意 cwd 必须指向 tmp_path 所在目录
```

## 坑2: +record-batch-create 格式 ≠ 对象数组

**现象**: 以为 `--json '[{"Slug":"F002"},...]'` 能批量建记录 → 报错 "--json must be a JSON object"

**根因**: batch create 格式是 `{"fields":["Slug","标题",...], "rows":[["F002","Title",...],...]}` — rows 是值数组，顺序对齐 fields

**修复**: 先 `+field-list` 确认字段顺序，rows 按同序填值。空字段用 `null`。

## 坑3: +field-update 用 --field-id 不是 --field-name

**现象**: `--field-name Slug` → "unknown flag --field-name, did you mean --field-id?"

**根因**: 字段重命名/更新用 `--field-id`，值可以是 ID 或名称，但 flag 名是 `--field-id`

**修复**: `--field-id fldDpMhc0x` 或 `--field-id Slug`

## 预防

- lark-cli 任何涉及 JSON 传入的命令优先用 `@file` 模式，不内联
- `+record-batch-create` 前先 `+field-list` 确认字段顺序
- 读 lark-cli 子命令 `--help` 确认 flag 名，不猜
