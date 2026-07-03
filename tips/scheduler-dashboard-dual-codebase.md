# Scheduler 仪表盘双代码库陷阱：dashboard.js ≠ app.js
type: diagnosis
date: 2026-07-03
source: cron 仪表盘拖拽回弹 bug，修改 dashboard.js 多次无效，最终发现真实 UI 代码在另一文件

## 现象
修改 `~/.scheduler/dashboard.js` 的 `renderCards` 函数，重启 server，浏览器 Ctrl+F5，修改不生效。curl 验证修改后的代码不在返回的 JS 中。

## 根因
Scheduler 仪表盘有**两套并存的前端代码**，`require('./dashboard')` 加载的 `dashboard.js` 是**旧遗留代码，不参与 UI 渲染**：

| 文件 | 加载方式 | 是否渲染 UI |
|------|---------|-------------|
| `~/.scheduler/dashboard.js` | `require('./dashboard')` in server.js line 10 | **否** — 遗留代码，导出 `js(schema)` 函数但未被调用 |
| `~/.scheduler/dashboard/js/app.js` | `<script type="module">` from `dashboard/index.html` | **是** — 真实 UI 代码 |

`/cron` 路由（server.js:147）直接 `fs.readFile('dashboard/index.html')` 从磁盘读取，不是通过 `require('./dashboard')`。`index.html` 加载 `dashboard/js/app.js` 作为 ES module。

`server.js` 的 `require('./dashboard')` 虽然存在但未使用—— `dashboard` 变量导入后没有任何地方调用。

## 修复/步骤
1. 确认真实入口：读 `server.js` 的 `/cron` 路由，看它 serve 的是什么文件
2. 沿着 `index.html` 的 `<script>` 标签找到真实 JS 文件
3. 所有 UI 修改面向 `dashboard/js/app.js`，不是根目录 `dashboard.js`
4. 静态文件通过 `express.static('/dashboard', ...)` 提供，有 `maxAge: '1h'` 缓存——改完需要 Ctrl+Shift+R 强制刷新

## 预防
改 scheduler dashboard UI 前，先读 `server.js` 的 `/cron` 路由确认入口文件。不要假设根目录同名文件就是真实代码——检查 `require()` 的变量是否真的被调用。
