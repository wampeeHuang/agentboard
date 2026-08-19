---
type: method
date: 2026-07-29
source: 飞书Base枚举表重建——table-create/record-batch-create 用 @file 静默失败
---

# lark-cli 命令 JSON 传递方式不统一：有的用 inline 有的用 @file

## 现象

同一套 `--json @_runtime/xxx.json` 写法，`+field-create` 和 `+record-batch-update` 能用，但 `+table-create` 报 `positional arguments are not supported`，`+record-batch-create` 静默失败。

## 根因

lark-cli 各命令对 JSON 参数的接收方式不统一：

| 命令 | JSON 传递方式 | 示例 |
|------|-------------|------|
| `+field-create` | `--json @path/file.json` | ✅ @file |
| `+field-update` | `--json @path/file.json` | ✅ @file |
| `+record-batch-update` | `--json @path/file.json` | ✅ @file |
| `+record-batch-create` | `--json '{"create_records":[...]}'` | ❌ 不支持 @file，必须内联字符串 |
| `+table-create` | `--fields '[{"name":"X","type":"text"}]'` | ❌ 不支持 @file，且用 --fields 不是 --json |
| `+table-create` | `--name "表名"` | 表名单独用 flag，不在 fields 里 |

## 修复/步骤

1. 遇到没见过的命令，先 `--help` 看示例
2. 示例里 `--json string` = 内联；`--json @file` 在 Tips 里才出现 = 有 @ 就是文件传递
3. 大 JSON 走文件时，写 Python 用 `subprocess` + `cwd=PROJECT`，路径用 `@_runtime/x.json` 相对路径
4. lark-cli 的 `@` 路径相对 CWD 解析，不是相对脚本目录

## 预防

- 新命令先用 `--dry-run` 确认参数被正确解析
- 永远在 subprocess 里设 `cwd=PROJECT`，不依赖当前工作目录
WSHELL使用 `--%` 停止解析符防止 `&` 等字符被 PowerShell 解释
