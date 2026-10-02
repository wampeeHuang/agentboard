---
type: diagnosis
date: 2026-10-03
domain: general
author: dsh-agent
source: 为架构图注册 gaodui-arch 工具卡，启动即失败；用 Node 精确复现 Agentboard 的 parseWindowsCommand 后定位
---

# manifest 的 cd 段带引号会让工具启动即失败：解析器只 trim 不剥引号
## 现象

新注册的工具卡点「启动」后立刻失败：

```text
state: start_failed
stateDetail: 上次启动失败（进程随即退出/超时）

_runtime/events.jsonl:
  tool-start         tool spawned, awaiting port  pid=45992 port=8782
  tool-start-crash   exited code=1 after 41ms: 锟侥硷拷锟斤拷锟斤拷目录...
```

两个容易误判的点：

- **进程确实起来了**（日志里有 pid），不是"可执行文件找不到"——所以不会去怀疑 exe 路径。
- **stderr 是乱码**（GBK 字节被按 UTF-8 读），只能看到「文件或目录不存在」，看不出是哪个文件。

## 根因

`lib/tool-registry.js` 的 `parseWindowsCommand()` 对 `cd` 段**只做 `.trim()`，不剥引号**：

```js
var cdMatch = p.match(/^cd\s+\/d\s+(.+)/i);
if (cdMatch) { overrides.cwd = cdMatch[1].trim(); continue; }   // ← 没有去引号
```

于是 `cd /d "D:/some/dir"` 解析出的 `cwd` **把引号当成路径的一部分**：

```text
cwd = "\"D:/some/dir\""     ← 带引号字面量
fs.existsSync(cwd) → false
```

`spawn(exe, args, { cwd })` 因 cwd 不存在而失败 → 41ms 退出。

不必猜，用 Node 复现同一段解析即可确认：

```js
const parts = cmd.split('&&').map(s => s.trim());
const m = parts[0].match(/^cd\s+\/d\s+(.+)/i);
const cwd = m[1].trim();
console.log(JSON.stringify(cwd));            // "\"D:/some/dir\""
console.log(require('fs').existsSync(cwd));  // false
```

## 修复/步骤

`startCommand` 里 `cd /d` 后面**直接写路径、不加引号**：

```json
"startCommand": "cd /d D:/tools/x/docs && C:\\path\\to\\python.exe serve.py --port 8782"
```

改完实测：`running: true`、`stateDetail: 运行中 · 账本确认`、`_runtime/pids/{id}.pid` 写入、端口 200。

更省事的写法（既有 tip `cmd-wrapper-pid-mismatch.md` 也指向这个方向）：**别写 `cd`，靠 `projectPath` 提供工作目录**。

## 预防

- 注册完工具**不能只看 API 的 `ok: true`**，要读 `state` / `stateDetail`；`start_failed` 的细节只在 `events.jsonl` 里。
- 「进程起来了但 41ms 就退」+「stderr 乱码、说不出文件名」→ 先怀疑 **cwd 解析**，别怀疑 exe。
- **路径含空格时这个解析器必坏**（引号会被当字面量）：这类路径不能靠 `cd /d` 设工作目录，得换方式。
