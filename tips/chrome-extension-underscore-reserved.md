---
type: diagnosis
date: 2026-08-22
source: grid-ruler 扩展加载失败——根目录 _runtime 目录导致 Chrome 拒绝加载
---

# Chrome 扩展根目录禁止任何 `_` 开头的一级项

## 现象

`chrome://extensions` 加载本地扩展报错，无法加载清单：

```
Cannot load extension with file or directory name _runtime.
Filenames starting with "_" are reserved for use by the system.
```

## 根因

Chrome 扩展根目录下任何 `_` 开头的文件或目录都被视为系统保留项，导致**整个扩展拒绝加载**。与内容无关——空目录同样触发。测试残留的 `_runtime/` 目录即可让扩展整体失效。

## 修复

从扩展根删除所有 `_` 开头的一级文件/目录。删除后重新加载扩展即可。

## 预防

- 扩展项目根目录严禁创建 `_` 开头的临时/运行目录（`_runtime`、`_output` 等），即使来自项目惯例。
- 测试产物（截图、脚本）放扩展根**外**的目录，或用非下划线命名。
- 在项目规则文件（AGENTS.md/CLAUDE.md）写明此约束，防止 Agent 按"项目内建 _runtime"惯例复现。
