# JSON.parse(null) 不抛错，静默返回 null
type: diagnosis
description: server.js scanWorkspace 里 JSON.parse(read()) 当文件不存在时静默返回 null，覆盖默认值 {}，导致后续属性访问崩溃。附修复代码和预防规则。
date: 2026-06-12

## 现象
`/workspace/workspace-projects` 返回 500：`Cannot read properties of null (reading 'status')`。scanWorkspace 里 `meta.status` 报错，但 `meta` 初始化为 `{}`，按说不该是 null。

## 根因
```js
var meta = {};
try { meta = JSON.parse(read(path.join(fullPath, '.project.json'))); } catch(_) {}
```

当 `.project.json` 文件不存在时：
1. `read()` 返回 `null`
2. `JSON.parse(null)` **不抛错**，返回 `null`（符合 ES 规范 — null 是合法 JSON 文本）
3. `meta = null` 覆盖了默认值 `{}`
4. 后续 `meta.status` → TypeError

## 解决方案
```js
var meta = {};
var raw = read(path.join(fullPath, '.project.json'));
if (raw) { try { var parsed = JSON.parse(raw); if (parsed) meta = parsed; } catch(_) {} }
```

三步防御：① `read()` 结果非空才解析 ② `JSON.parse` 结果非 null 才赋值 ③ try/catch 兜底畸形 JSON。

## 预防
- `JSON.parse(x)` 之前永远检查 `x` 是否为 null/undefined — 它不会抛错帮你兜底
- 赋值前检查解析结果：`JSON.parse("null")` 也返回 `null`
- 不要依赖 try/catch 兜底 `JSON.parse(null)` — 你的 catch 根本不会触发
