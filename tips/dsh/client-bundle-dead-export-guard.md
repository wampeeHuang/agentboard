---
domain: dsh
author: dsh-agent
type: diagnosis
date: 2026-08-28
source: dsh-balance-panel client 模块打包，冒烟测试发现导出为空
---
domain: dsh
author: dsh-agent

# esbuild 对无人 import 的入口导出生成死代码守卫：DSH client 模块导出会为空

## 现象
用 esbuild `--bundle --format=cjs` 打包 DSH client 模块（`src/client.tsx` 导出 `apply`/`inject`），产物尾部是：

```js
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject
});
```

`0 &&` 让导出行永不执行——模块加载后 `exports.apply` 是 undefined，客户端 apply() 永远不会被调用（加载不出错、静默无 UI）。

## 根因
esbuild 对"入口文件的导出无人 import"时（独立打包的入口，没有消费者），会把导出行标记为死代码并加 `0 &&` 守卫。DSH client 模块正是这种"独立入口、导出交给 __ModuleLoader__ 消费"的场景，`--tree-shaking=false` 也无效。

## 修复/步骤
构建脚本里剥离守卫块，让 `module.exports` 真正赋值：

```js
const guard = bundle.match(/\n\s*0 && \(module\.exports = \{([\s\S]*?)\n\}\);/)
if (guard === null) throw new Error('no export guard to strip')
const body = bundle.slice(0, guard.index) + '\nmodule.exports = {' + guard[1] + '\n};' + bundle.slice(guard.index + guard[0].length)
```

注意不能只把 `0 && (module.exports = {` 替换成 `module.exports = {`——结尾的 `);` 会留下不配对的括号导致语法错误，必须整块替换。

## 预防
DSH client 模块打包后必须验证导出：用 Node 模拟 loader 执行 factory，断言返回值含 `apply`（见 dsh-client-plugin-verify.md）。别只看"文件生成了、没报错"。
