---
type: diagnosis
date: 2026-08-06
source: source-rack CHECKPOINT.md 搬运失败
---

# CHECKPOINT.md 删了又自动重建

## 现象

删除 CHECKPOINT.md 或搬到子目录后，文件立刻在根目录重新出现。

## 根因

`~/.claude/hooks/checkpoint.js` 是 Claude Code 的 PreToolUse hook，
每次 Bash/Write/Edit 工具调用前自动写入 `cwd/CHECKPOINT.md`。
`.gitignore` 只能忽略，不能阻止写入。

## 修复

改 hook 源码第 22 行：

```js
// 之前：写死根目录
const handoffPath = path.join(cwd, 'CHECKPOINT.md');

// 之后：写入 _runtime/
const runtimeDir = path.join(cwd, '_runtime');
if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
const handoffPath = path.join(runtimeDir, 'CHECKPOINT.md');
```

## 预防

新项目创建时确保 `_runtime/` 目录存在。hook 自动创建兜底。
