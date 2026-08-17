# Vercel `visibility: public` 静默过滤

**type**: pitfall
**date**: 2026-08-07
**source**: gallery deploy — 7 个新模板部署后公网不可见

## 现象

新注册的模板在本地 `localhost:3080` 可见，push 到 Vercel 后消失。API 返回 count 比预期少。不报错、不警告。

## 根因

`server.js` 在 Vercel 环境下过滤 `visibility !== 'public'` 的条目：

```javascript
const isPublic = process.env.VERCEL || process.env.PUBLIC_MODE;
if (isPublic) {
  items = items.filter(e => e.visibility === 'public');
}
```

新条目没写 `visibility` 字段 → `undefined === 'public'` = false → 被过滤。静默失败。

## 修复

给 registry 条目加 `"visibility": "public"`：
```javascript
items.forEach(t => { if (!t.visibility) t.visibility = 'public'; });
```

## 预防

- 注册脚本强制带 `visibility` 默认值
- 本地用 `VERCEL=1 node server/server.js` 模拟生产环境测试
- 部署前检查脚本：
  ```bash
  node -e "const r=JSON.parse(require('fs').readFileSync('data/registry.json','utf-8')); const m=r.filter(t=>!t.visibility); if(m.length) { console.log('MISSING visibility:'); m.forEach(t=>console.log('  '+t.slug)); process.exit(1); }"
  ```
