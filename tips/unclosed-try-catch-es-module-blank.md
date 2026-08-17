# ES module 未闭合 try/catch → 静默空白页

type: diagnosis
date: 2026-07-24
source: scheduler dashboard — 两个并发 Claude 会话修改 app.js，一个加了 `try {` 被中断，`catch` 块未写入

## 现象

`<script type="module">` 加载的 JS 文件有语法错误（`try {` 未闭合）。页面完全空白，DevTools 控制台零报错，F12 能打开但 Elements 面板只有空的 `<html><head><body>`。

## 根因

ES module parse error 发生在模块执行之前。整个模块解析失败 → 不执行 → 不注册任何错误处理 → `window.onerror` 也抓不到。`try` 未闭合是 JS parser 级别的错误，不是运行时异常。

`type="module"` 自带 `defer`，浏览器先下载、解析、再执行。解析阶段的错误不会冒泡到任何运行时 handler。

## 排查

空白页 + 控制台零报错 → 第一检查项：**文件末尾是否有未闭合的块**（`{` 多一个或 `}` 少一个）。

```bash
# 快速检查：数文件的 { 和 } 是否匹配
grep -c '{' app.js  # 左花括号数
grep -c '}' app.js  # 右花括号数
```

## 修复

```javascript
// 补 catch 闭包 + fallback HTML
async function init() {
  try {
    // ... 所有初始化代码 ...
  } catch (e) {
    console.error('init failed', e);
    document.body.innerHTML = '<div>加载失败，请刷新重试</div>';
  }
}

// boot 段也加 .catch()
init().catch(function (e) { console.error('boot init failed', e); });
```

## 预防

1. **两个会话不同时改同一个文件。** 项目内可并行，文件级互斥
2. **带 try 的改动一次性写完闭包再保存。** 保存含未闭合 try 的文件 = 埋雷
3. **空白页排查清单：** 缓存 → 网络 200？→ 数花括号 → 看 file diff
