# `</script>` 注入在已有 script 标签内导致 JS 裸奔为文本

type: diagnosis
date: 2026-06-20
source: loop-dashboard.html 页面修复——server.js 往 HTML 模板的 <!--LOOP_DATA_INJECT--> 占位符注入 `<script>` 包装的 JS 数据

## 现象

页面打开后 JS 代码以纯文本形式显示在页面上，不是正常渲染的 UI。浏览器 F12 看 DOM：大量 `<script>` 标签内的 JS 代码出现在 body 里当文本节点。

node --check 验证 JS 文件通过，语法本身无问题。

## 根因

server.js 在渲染 HTML 时做了：

```js
html.replace('<!--LOOP_DATA_INJECT-->', '<script>window.__loopData=' + dataSnap + ';</script>')
```

而 `<!--LOOP_DATA_INJECT-->` 这个占位符**已经在另一个 `<script>` 标签内部**。浏览器的 HTML 解析器不区分 JS 上下文——只要在 HTML 源码里看到 `</script>`，就直接关闭当前 script 元素。注入的 `<script>...</script>` 中的 `</script>` 关闭了外层 script 标签，剩余 JS 代码全部变成 HTML 文本节点。

这和 JS 注释、字符串无关。`</script>` 在 HTML 里就是硬终止。哪怕写在 `//` 注释里也会关闭。

## 修复/步骤

注入裸 JS 变量，不注入 `<script>` 包装：

```js
// 错
html.replace('<!--LOOP_DATA_INJECT-->', '<script>window.__loopData=' + data + ';</script>')

// 对
html.replace('<!--LOOP_DATA_INJECT-->', 'window.__loopData=' + data + ';')
```

## 预防

- 往 `<script>` 内部注入数据时，永远只注入 JS 代码，不加 `<script>` 标签
- 占位符在 `<script>` 内外搞不清时，搜 HTML 模板确认
- node --check 只能验证独立 .js 文件，查不出这种 HTML 层面的浏览器解析问题——需要浏览器实际渲染来验证
