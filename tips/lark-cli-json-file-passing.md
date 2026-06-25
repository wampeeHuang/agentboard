# lark-cli --json 文件传递：相对路径 + 无BOM

type: tip
date: 2026-06-25
source: 猫波信号站 · 飞书选题库批量更新

## 现象

`lark-cli base +record-upsert --json '{"key":"value"}'` 和 `--json "@absolute/path.json"` 均报错：
- 内联 JSON：`invalid character 'S' looking for beginning of object key string`（PowerShell 转义问题）
- 绝对路径：`--file must be a relative path within the current directory`
- UTF-8 BOM：`invalid character 'ï' looking for beginning of value`

## 根因

1. `--json @file` 只接受**相对路径**，且必须在当前目录内
2. PowerShell `Out-File -Encoding utf8` 写入 UTF-8 BOM（`ï»¿`），`lark-cli` 不处理 BOM
3. PowerShell 命令行中内联 JSON 的花括号和引号转义不可靠

## 修复

```powershell
# 正确做法：先 cd 到项目目录，用 .NET 写无 BOM 文件，再传相对路径
Set-Location "D:\workspace\project"
[System.IO.File]::WriteAllText("$pwd\_runtime\tmp.json", '{"FieldName":"value"}')
lark-cli base +record-upsert --base-token <token> --table-id <tbl> --record-id <rid> --json "@_runtime\tmp.json" --as bot
```

## 预防

- `lark-cli` 所有写操作（+record-upsert、+field-update、+field-create）统一用 JSON 文件传递，不走命令行内联
- 文件用 `[System.IO.File]::WriteAllText()` 写，不用 `Out-File`
- 路径用相对路径，先 `cd` 到项目根目录
