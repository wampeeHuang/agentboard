---
type: diagnosis
date: 2026-08-27
source: 会话清理 C:\Users\Administrator 根目录过程文件
---

# checkpoint hook 在家目录根建 _runtime 污染根目录

## 现象

家目录根反复出现 `_runtime\CHECKPOINT.md`，删掉后数分钟内重生。根目录还混入大量散装脚本/截图/JSON（github-mgmt 批处理、vision 裁图等 70 项），全是会话过程文件落错位置。

## 根因

`~/.claude/hooks/checkpoint.js`（PreToolUse hook）写入逻辑：

```js
const cwd = process.env.CLAUDE_PWD || process.cwd();
const runtimeDir = path.join(cwd, '_runtime');
```

会话以家目录为 cwd 启动时（在 `C:\Users\Administrator` 直接开 claude），每次 Bash/Write/Edit 调用都在家根创建 `_runtime\` 并写 CHECKPOINT.md。目录里的散装过程文件是历次家目录会话的累积沉淀，hook 建目录在前，agent 顺手往里写文件在后。

## 修复

checkpoint.js 判断 cwd === 家目录时改写到白名单区 `~/.claude/_runtime/`：

```js
const homeDir = process.env.USERPROFILE || require('os').homedir();
const runtimeDir = path.resolve(cwd) === path.resolve(homeDir)
    ? path.join(homeDir, '.claude', '_runtime')
    : path.join(cwd, '_runtime');
```

验证方式：`echo '{"tool_name":"Bash","arguments":{"command":"echo hi"}}' | node checkpoint.js`，配合 `CLAUDE_PWD` 指到家目录，确认家根不重建、`.claude\_runtime\CHECKPOINT.md` 生成。

## 预防

- 家目录开 claude 会话是常态 → 任何按 cwd 落文件的 hook/脚本都必须处理"cwd 不是项目"的分支，家目录白名单区是唯一合法落点
- 见到家根冒出新目录 + 里面只有单文件反复更新（CHECKPOINT.md 时间戳 = 会话内每步刷新）→ 先查 hooks，再怀疑应用
