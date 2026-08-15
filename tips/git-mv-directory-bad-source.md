# git mv 目录报 "fatal: bad source"，因 index 有已删除文件

type: pitfall
date: 2026-08-15
source: layout-gallery platform/ → scripts/ + growth/ 目录拆分

## 现象

`git mv platform scripts` 想整体移动目录，报错：

```
fatal: bad source, source=platform/import-upstream.mjs
```

直觉以为 `git mv` 会像 `mv` 一样搬整个目录，结果直接失败。

## 根因

目录里有两个文件（import-upstream.mjs、recipe-generator.mjs）在 index 里已经是删除状态（D），但工作区文件还在。`git mv` 移动目录时会逐个处理目录内文件，碰到 index 里已删除的文件就拒绝，整条命令失败。

## 修复

不用整目录 `git mv`，按文件逐个处理：

1. **已跟踪且未删**的文件 → `git mv platform/xxx.mjs scripts/xxx.mjs`
2. **未跟踪**的文件 → 普通 `mv platform/xxx.mjs scripts/`
3. **index 里已删除**的文件 → 跳过（它们本就该删）
4. 全部搬完 → `rmdir platform`（此时应为空或只剩该删的）

```bash
# 拿已跟踪文件清单，逐个 git mv
git ls-files platform/ | while read f; do git mv "$f" "${f/platform/scripts/}"; done
```

## 预防

- 移动目录前先 `git status --short platform/` 看是否有 D 状态文件
- 有 D 状态文件时，先决定它们的去留（删掉或恢复），再移动目录
- 别假设 `git mv` 等价于 `mv`——它受 index 状态约束
