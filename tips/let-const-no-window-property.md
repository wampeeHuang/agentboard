---
type: diagnosis
date: 2026-07-22
source: 版式画廊筛选器全部失灵，selectFilter 用 window[key] 写入、fetchFiltered 读 let 变量，两边不同绑定
---

# let/const 在全局 script 作用域不创建 window 属性——动态属性读写必须用对象

## 现象

- 页面所有筛选器芯片点击无反应
- 网络请求参数始终是默认值（全部 `'all'`），不随点击变化
- 无报错，静默失效

## 根因

```javascript
// 顶层 <script> 中：
let activeSource = 'all';      // 全局绑定，但不是 window 属性
const activeStyle = 'all';     // 同上

// selectFilter 中用：
window['activeSource'] = value;  // 创建了新的 window.activeSource，不是上面的 let 变量

// fetchFiltered 中读的是 let activeSource（始终 'all'），不是 window.activeSource
```

`let`/`const` 在顶层 script 中创建全局绑定，但**不创建 `window` 对象的属性**。`var` 才会。`window[key] = value` 只会创建/修改 window 属性，和 `let` 声明的全局变量是完全独立的两个绑定。

## 修复

用普通对象代替独立变量，统一用动态 key 读写：

```javascript
// BEFORE（两个不互通的绑定）：
let activeSource = 'all', activeStyle = 'all', activeScheme = 'all';
// ...
window[map[group]] = value;  // 写的是 window 属性
// ...
if (activeSource !== 'all') ...  // 读的是 let 变量 ← 永远 'all'

// AFTER（同一个对象，同源读写）：
const F = { source: 'all', style: 'all', scheme: 'all' };
// ...
F[group] = value;   // 写同一个对象
// ...
if (F.source !== 'all') ...  // 读同一个对象
```

## 预防

- 需要动态 key 访问的全局状态，用普通对象 `const F = { key: val }`，不用独立 `let` 变量
- 永远不用 `window[key]` 做状态管理——静默创建新属性，无报错
- 代码审查时关注 `window['xxx']` 写法——它创建的不是你以为的变量
- 如果必须用 `let` 声明全局变量，且需要 `window[key]` 访问，改用 `var`
