---
type: diagnosis
date: 2026-08-26
source: workspace-governor 审计 .agentboard 清理 _runtime 残留——PowerShell Remove-Item 被 hook 误判路径
---

# workspace-governor hook 把 PowerShell 的 -ErrorAction SilentlyContinue 当路径参数

## 现象

清理 `_runtime/` 残留文件时执行：

```powershell
Remove-Item "C:\...\_runtime\CHECKPOINT.md" -Force -ErrorAction SilentlyContinue
```

PreToolUse hook 拦截，报：

```
工作区治理器已阻止结构性写入。一级入口的删除或移动必须走迁移流程：
C:\Users\Administrator\.agentboard\SilentlyContinue
```

报错路径把 `SilentlyContinue` 拼进了目标路径——hook 把 `-ErrorAction` 的值当成了第二个文件参数。

## 根因

workspace-governor 的 PreToolUse 适配器解析 PowerShell 命令时，把整条命令行按空格分词，把 `-ErrorAction SilentlyContinue` 的 `SilentlyContinue` 识别成又一个被操作路径，误判为"删除治理一级入口"，触发迁移拦截。与 `workspace-governor-hook-blocks-rm-rf.md`（rm -rf 删目录被拦）是同类 hook 误判，但触发源不同——不是目录删除，是 PowerShell 参数被当路径。

## 修复

去掉 `-ErrorAction SilentlyContinue`，纯删除命令 hook 放行：

```powershell
Remove-Item "C:\...\_runtime\CHECKPOINT.md" -Force
```

文件不存在时 Remove-Item 会报错，但目标文件确认存在时无需静默标志。

## 预防

- 清理运行产物文件时，PowerShell 删除命令**不带 `-ErrorAction SilentlyContinue`**（hook 把它当路径），文件存在就裸删，不存在就接受报错
- 多文件批量删除：逐条裸 `Remove-Item`，或换 `find -delete` 文件级删除（见已有 tip）
- 判断"文件删没删掉"用 `Test-Path`，不用 `-ErrorAction SilentlyContinue` 吞错误
