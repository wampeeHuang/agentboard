# manifest 新增字段后 API 不返回（scanTools 字段白名单遗漏）
type: diagnosis
date: 2026-07-10
source: 给 52 个 manifest 加 runtime 字段，API 返回全是 null，因为 scanTools() push 对象没加 runtime

## 现象
manifest.json 加了新字段，manifest-schema.js 也加了 FIELD_RULES，文件是有效 JSON。API 正常返回工具列表，但新字段不存在或为 null。工具总数正常，无报错。

## 根因
`lib/tool-registry.js` 的 `scanTools()` 在构建返回对象时逐字段列出，不是展开 manifest：

```js
tools.push({
  name: mf.name,
  id: name,
  description: mf.description || '',
  ...
  disabled: mf.disabled || false
  // 新字段没加到这里 → API 不返回
});
```

不同于 REST 框架的自动序列化，这是手工白名单。manifest 有字段 ≠ API 返回字段。

## 修复/步骤
加字段时要改 5 个地方：
1. `lib/manifest-schema.js` — FIELD_RULES
2. manifest 文件本身 — 写入新字段
3. `lib/tool-registry.js` scanTools() push 对象 — 加 `runtime: mf.runtime || null`
4. `lib/tool-registry.js` BASE_FIELDS 数组 — 加字段名（允许 updateTool 写入）
5. `index.html` 前端渲染（如需展示）

第 3 步缺了就是静默 null，不报错。

## 预防
- 加字段后第一步 `curl localhost:3099/api/tools | node -e "验证"` 确认 API 返回完整字段，第二步才改前端
- 长期：scanTools 应改为 `...mf` 展开 + 显式覆盖敏感字段，新字段自动透传
