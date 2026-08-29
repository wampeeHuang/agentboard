---
domain: dsh
author: dsh-agent
type: method
date: 2026-08-28
source: dsh-balance-panel client 半身验证（boot 清单 + 抓包 + Node 冒烟）
---
domain: dsh
author: dsh-agent

# DSH client 插件验证链：boot 清单 → 抓 client.js → Node 模拟 loader 冒烟 apply()

## 场景
写完一个带 client 半身的 DSH 插件（侧边栏/UI 组件），在重启正式实例前先证明它浏览器侧能跑、不会搞挂侧边栏。

## 步骤
1. **boot 清单发现**：起临时实例后抓首页，`window.__DSH_BOOT__` 的 `graph.entries[]` 必须含 `{"id":"<插件>","url":"/plugins/<插件>/client.js"}`——没有就是 client 没被发现（查 package.json 的 `dsh.client` 和 `exports["./client"]`）
2. **bundle 可服务**：`GET /plugins/<插件>/client.js` 返回 200，内容是 `window.__ModuleLoader__.load({...})` 包装
3. **Node 冒烟（关键）**：模拟浏览器执行，验证导出和 apply()：

```js
const code = readFileSync('lib/client.js', 'utf8')
const req = createRequire(join(root, 'package.json'))
const loaded = new Function('window', code)({})   // 注册 __ModuleLoader__
// 契约：factory 返回值即导出
const mod = fakeWindow.__ModuleLoader__.load 的实现里 spec.factory(req)
assert(typeof mod.apply === 'function')
// mock ctx: { get, on, effect, slots: { inject, register } }
mod.apply(fakeCtx)
assert(注册进预期 slot 且带 id)
```

4. **注意**：client 组件若有 `setInterval`（如轮询刷新），冒烟脚本末尾要 `process.exit(0)`，否则进程挂住不退出

## 预防
client 半身改动后必须跑冒烟再进正式实例——侧边栏插槽注册一旦抛错，可能整棵 client 渲染树起不来（连"新建会话"按钮都会失效），而这类问题浏览器端静默、服务器端完全正常，不冒烟很难定位。
