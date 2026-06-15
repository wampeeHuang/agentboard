# 前端 API 路径与后端路由前缀不匹配导致全功能静默失败
type: diagnosis
date: 2026-06-14
source: 社媒数据抓取 — Cookie 保存后刷新消失，排查发现所有 API 调用均 404

## 现象
- 用户在 UI 填写 Cookie → 点保存 → 按钮变绿，看起来成功
- 刷新页面 → Cookie 消失，恢复红色"未配置"
- 所有功能（赛道发现、博主采集、笔记提取）同样静默失败，但 UI 无任何报错

## 根因
前端 `const API = 'http://localhost:3095'`，所有 `api()` 调用拼出路径不含 `/api` 前缀。
后端所有路由挂在 `/api/` 下（`/api/xhs/config`、`/api/status` 等）。

保存 Cookie 时，前端先执行 `xhs.cookie = val`（内存赋值），再调 `api('/xhs/config', 'POST', ...)` → 后端返回 `{"error": "not found"}` 404，但代码未检查返回值 → 按钮变绿只是内存假象，文件从未写入。

```
前端调用: http://localhost:3095/xhs/config → 404
后端路由: http://localhost:3095/api/xhs/config → 正常工作
```

## 修复
一行：`const API = 'http://localhost:3095'` → `const API = 'http://localhost:3095/api'`
14 个 `api()` 调用点一次性修正。

## 预防
- 单文件 HTML 应用的前后端路径对应关系，用 curl 逐条验证，不只靠 UI 表象
- 前端 `api()` 包装函数应检查 HTTP 状态码，非 2xx 时 toast 报错，而非静默吞掉
- 后端统一路由前缀时，前端 `const API` 必须同步包含该前缀
