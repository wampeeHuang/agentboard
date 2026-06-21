# .gitmodules 中文路径用正则编辑会编码损坏
type: diagnosis
date: 2026-06-20
source: 批量修改 claude-skills 的 .gitmodules，用 PowerShell 正则删除 huashu 条目后，猫波信号站的 section 编码变成乱码

## 现象

`.gitmodules` 中 `[submodule "猫波信号站"]` 被 PowerShell 正则替换后变成：
```
[submodule "鐚尝淇″彿绔?]
	path = 鐚尝淇″彿绔?	url = https://...
```
Git 报 `fatal: bad config line`，.gitmodules 无法解析。

## 根因

PowerShell 5.1 的 `-replace` 操作处理 UTF-8 中文时，在管道中间环节丢失编码信息。正则匹配虽成功，但替换结果写回文件时字节序列损坏。`Set-Content` 即使指定 `-Encoding utf8` 也无法挽救已经被破坏的内存字符串。

## 修复/步骤

**已发生**：放弃编辑，直接重写整个 `.gitmodules` 文件（用 Write 工具或 `Set-Content` 写全新内容）。

**预防**：涉及中文路径的 `.gitmodules` 修改，用完整重写代替局部编辑。子模块不多时最安全。

## 预防

- 含非 ASCII 字符的配置文件 → 重写全文件，不做正则局部替换
- 如果确实需要程序化编辑，用 Python 而非 PowerShell 字符串操作
