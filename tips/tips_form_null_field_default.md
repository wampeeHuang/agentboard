# form:null schema 字段陷阱

type: pattern
date: 2026-08-02
source: ~/.scheduler/ dashboard 链路改造

## 现象
schema 中 `form: null` 的字段不渲染到表单 HTML，`submitForm()` 跳过该字段。服务端收到 `body.field === undefined`。

## 错误模式
```javascript
// WRONG — undefined !== false = true, 每次 PUT 都重置
job.enabled = body.enabled !== false;
```

## 正确模式
```javascript
// RIGHT — 只在表单显式传了值才改，PUT 保留原值
if (body.enabled !== undefined) {
  job.enabled = body.enabled !== false;
} else if (!existing) {
  job.enabled = true; // POST 新任务默认值
}
```

## 触发条件
- schema 字段定义 `"form": null`（不在表单中出现）
- 服务端对该字段做 `body.field !== false` 判断
- 用户编辑任务的其他字段后保存

## 修复
server.js `formToJob()` 对所有 `form: null` 字段加 undefined guard。
