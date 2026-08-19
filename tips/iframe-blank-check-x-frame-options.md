---
type: diagnosis
date: 2026-08-02
source: 作品集 Forma 卡片 iframe 空白——花了 10min 查 scaleOne 缩放逻辑，最后发现是服务器拒绝嵌入
---

# iframe 空白先查响应头，不查渲染逻辑

## 现象

iframe 在卡片里完全不显示内容，但 `<iframe>` DOM 存在、src 已设置、缩放逻辑正常执行。同页面其他 iframe 正常。

## 根因

服务器返回 `X-Frame-Options: DENY` 或 CSP `frame-src 'none'`，浏览器静默拒绝渲染 iframe。无报错、无控制台警告（跨域时），只有空白。

**Forma 案例**：
```
x-frame-options: DENY
content-security-policy: ... frame-src 'none' ...
```

这是 Vercel 部署的 Next.js 项目默认行为。Vercel 默认加 `X-Frame-Options: DENY`。

## 诊断步骤

```
1. Puppeteer 抓目标 URL → 查 response headers
2. 搜 x-frame-options / frame-src / frame-ancestors
3. 命中 DENY/SAMEORIGIN/none → 无法嵌入，换截图
```

**不要**：改 iframe 宽高、改缩放参数、改 CSS overflow、改 z-index。这些都是浪费时间的死胡同。

## 修复

截图替代（Puppeteer fullPage screenshot），别无他法。服务器安全头客户端不可绕过。

## 预防

任何 iframe 不显示的先查三步，顺序不能乱：
1. 响应头 X-Frame-Options / CSP frame-src — **先查这个**
2. src 是否真的设了（lazy-load 脚本有 200ms 延迟）
3. 最后才看缩放/CSS 渲染
