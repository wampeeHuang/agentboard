---
domain: dsh
author: dsh-agent
type: fact
date: 2026-08-28
source: dsh-balance-panel 开发，读上游 dsh-client-ui-sidebar / dsh-client-modules 源码确认
---
domain: dsh
author: dsh-agent

# DSH web client 模块契约：__ModuleLoader__.load + factory 返回值即导出 + sidebar.footer.action 插槽

## 事实

### 打包格式（所有上游 lib/client.js 同款）
```js
window.__ModuleLoader__.load({
  id: "<pkg名>",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    <CJS bundle，react / @deepseek-ai/* 全部 external，走 require()>
    return module.exports;   // ← 契约：factory 的返回值才是模块导出
  }
});
```

- external 解析：`react`/`react/jsx-runtime` 是 loader 的 seed word；`@deepseek-ai/*` 由共享 client 模块图提供
- **factory 返回导出对象**——测试时不要检查外部 module 变量（factory 内部有自己的 module 遮蔽），要用返回值

### package.json 双半身声明
- `dsh.bundle.patch` → host 半身（`main` → lib/host.js）
- `dsh.client`：`{ platform: "web", inject: ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-connection", ...] }` + `exports["./client"]` → client 半身（lib/client.js）
- host 半身 `inject: ['webServer']`；client 半身 `inject: ['slots', 'connection']`（client 的 inject 是服务名，不是包名）

### 侧边栏余额/操作挂载点（上游公开插槽，rc.6 真实渲染）
`@deepseek-ai/dsh-client-ui-sidebar/lib/client.js` L211：`renderSlot("sidebar.footer.action", { wide })`——设置按钮旁的可选操作。注册：

```ts
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: '<唯一id>',      // list 槽必填
  order: 10,
  inject: () => ({ controller }),
}, Component))
```

组件收到的 props：`{ wide: boolean }`（列状态）+ 注入的 business face。

### 验证入口
- 页面 `window.__DSH_BOOT__` 清单 `graph.entries[]` 含 `{"id": 插件名, "url": "/plugins/<名>/client.js"}` → client 被发现
- `/plugins/<名>/client.js` 可直接下载验证内容
