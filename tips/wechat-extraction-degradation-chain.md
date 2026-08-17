# 微信文章提取降级链：CodeBuddy → Chrome DevTools snapshot
type: method
date: 2026-07-20
source: 同步微信发布版文章到本地，CodeBuddy CLI 返回 429 额度用尽

## 降级链（按优先级）

| 优先级 | 方式 | 限制 | 适用场景 |
|--------|------|------|---------|
| 1 | Chrome DevTools `new_page` + `take_snapshot` | 需要浏览器已打开，a11y tree 含完整文本 | **首选**——无额度限制，无渲染问题 |
| 2 | Coze 微信提取工具（工具架 `coze-wx-extract`） | Coze 额度 | 需要结构化提取时 |
| 3 | CodeBuddy CLI | 有 429 额度限制 | 备用 |

## 为什么 Chrome DevTools 是首选
- a11y snapshot 包含页面所有可见文本，不需要渲染 JS
- 零额度成本
- 微信文章 DOM 结构稳定，snapshot 文本完整
- WebFetch 会撞微信反爬验证码，100% 失败

## 步骤
1. `new_page` → 打开微信文章 URL
2. `wait_for` → 等文章标题出现
3. `take_snapshot` → 获取 a11y tree 全文
4. 从 snapshot 中提取正文内容

## 预防
- 微信反爬是确定性的，WebFetch/WebSearch 不用试
- 新会话遇到微信文章提取，默认走 Chrome DevTools snapshot，不走 CodeBuddy
