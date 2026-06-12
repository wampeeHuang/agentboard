# JSON.parse(null) 不抛错，静默返回 null
type: diagnosis
date: 2026-06-12
source: server.js scanWorkspace() — 工作区子页面开发

## 现象
`/workspace/workspace-projects` 返回 500：`Cannot read properties of null (reading 'status')`。scanWorkspace 里 `meta.status` 报错，但 `meta` 初始化为 `{}`，按说不该是 null。

## 根因
```js
var meta = {};
try { meta = JSON.parse(read(path.join(fullPath, '.project.json'))); } catch(_) {}
```

当 `.project.json` 文件不存在时：
1. `read()` 返回 `null`
2. `JSON.parse(null)` **不抛错**，返回 `null`（符合 ES 规范）
3. `meta = null` 覆盖了默认值 `{}`
4. 后续 `meta.status` → TypeError

`JSON.parse(null)` 不抛异常是 JavaScript 的设计行为 — `null` 是合法的 JSON 文本，解析结果就是 `null`。

## 修复
```js
var meta = {};
var raw = read(path.join(fullPath, '.project.json'));
if (raw) { try { var parsed = JSON.parse(raw); if (parsed) meta = parsed; } catch(_) {} }
```

## 预防
- `JSON.parse(x)` 之前永远检查 `x` 是否为 null/undefined
- 不要依赖 try/catch 兜底 `JSON.parse(null)` — 它不会抛错
- 赋值前检查解析结果：`JSON.parse("null")` 也返回 `null`，同样会覆盖默认值
