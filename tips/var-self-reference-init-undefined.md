---
type: diagnosis
date: 2026-08-25
source: /api/apps 500，网站卡片全消失 — APPS_REG 自引用初始化
---

# 变量自引用初始化恒为 undefined，环境变量默认值用字面量

`var x = process.env.A || x;` — 右侧 x 是 var hoisting 后未赋值的自己 = undefined。env 为空时 x 变 undefined 而非默认值，读取 undefined 路径即 500。

## 现象

`/api/apps` 返回 500，dashboard 网站卡片全消失。报错路径是 `undefined` 拼出来的文件路径。

## 根因

```js
var APPS_REG = process.env.AGENTBOARD_APPS_REGISTRY || APPS_REG; // 右侧是 hoisted 的 undefined
```

var 声明 hoisting 到作用域顶部但未赋值，右侧引用的 `x` 恒为 `undefined`。env 未设置时 `||` 拿到 undefined，丢掉了本应有的默认路径。

## 修复/步骤

默认值用字面量，不写自引用：

```js
var APPS_DIR = process.env.AGENTBOARD_APPS_REGISTRY || path.join(__dirname, '..', 'apps');
```

## 预防

- 环境变量默认值一律用字面量（常量/路径），禁止 `process.env.X || x` 自引用
- 扫描代码：`= process.env\.\w+ \|\| \w+` 模式，右侧与左侧同变量名即隐患
- 服务 500 先看有没有 undefined 参与的路径拼接
