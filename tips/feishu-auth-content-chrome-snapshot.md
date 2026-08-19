---
type: method
date: 2026-07-27
source: 德城报价系统——读取飞书脑图中的计价规则
---

# 飞书认证页面（脑图/文档）用 Chrome DevTools snapshot 读取

## 现象

`WebFetch` 抓取飞书脑图/文档 URL → 302 重定向到飞书登录页。页面内容返回"请登录"，无法获取实际文档内容。

## 根因

飞书云文档（feishu.cn）所有页面需要登录态。`WebFetch` 工具不带浏览器 cookie，每次请求都是匿名用户。

## 修复/步骤

用户已在浏览器登录飞书 → 用 Chrome DevTools MCP 代替 WebFetch：

1. `navigate_page` → 飞书脑图 URL
2. `take_snapshot` → 整页 a11y tree 文本快照（uid+内容）
3. `Read` 快照文件 → 提取节点文本

注意：快照是 a11y tree 不是 DOM，所有文本节点会拍平显示。脑图的层级关系从相邻节点的缩进推断，不直接从 tree 结构继承。

## 预防

遇到飞书认证页面（feishu.cn/*、*.feishu.cn）的 URL：
- 不试 WebFetch（必然 302）
- 直接用 Chrome DevTools — 浏览器已有登录态
- 如果浏览器也未登录 → 提示用户打开飞书页面登录后再试
