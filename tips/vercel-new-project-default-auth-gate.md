---
type: diagnosis
date: 2026-09-25
source: 宋连达官网首次部署到 Vercel——部署成功、内容正确，但公网访问被判成登录页
---

# Vercel 新项目默认开 Deployment Protection：公网看到的是登录页

## 现象

`vercel deploy --prod` 报 `✓ Ready`，Vercel 侧看一切都对（deployment Ready、域名已绑、Project ✔ Verified）。

用浏览器实际打开生产地址，得到的是：

```
HTTP 200   标题「Login – Vercel」   h1「Log in to Vercel」
控制台: Failed to load resource: the server responded with a status of 403
       Provider's accounts list is empty.
```

**HTTP 200 + 标题是登录页** —— 状态码、字节数、甚至"图片 0 张未加载"都合格，如果只看状态码会直接放过。

## 根因

Vercel **新建项目默认启用 Deployment Protection（Vercel Authentication）**：

```json
"ssoProtection": { "deploymentType": "all_except_custom_domains" }
```

注意这个默认值：`all_except_custom_domains` —— **自定义域名豁免、`*.vercel.app` 不豁免**。所以：

- 生产别名 `xxx.vercel.app` → 被 302 到 SSO 登录页
- 绑定的自定义域名 → 能正常访问

如果你先用 `.vercel.app` 验收再绑域名（很自然的顺序），就会误判成"部署坏了"或"站点是空的"，而真实情况是访问控制。

## 修复

用 API 关掉（CLI 没有直接命令）：

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/<projectId>?teamId=<teamId>" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}'
```

`token` 在 `%APPDATA%\xdg.data\com.vercel.cli\auth.json`（Windows 为 XDG 路径，不是 `~/.vercel/config.json`）。

## 预防

1. **部署验证必须看页面内容，不能只看状态码。** 判定式：`title` 不是 `Login – Vercel`、`<h1>` 是站点的、正文字数 > 阈值。
2. 新建 Vercel 项目后**第一件事**就是决定是否要 Deployment Protection：公开展示的站点必须关；内部预览站可以留着（留着时不要用"打开正常"来判断站点质量）。
3. 记住默认值是 `all_except_custom_domains` —— **同一份部署，自定义域名正常、vercel.app 别名被拦**，是正常现象而不是故障。
4. 与既有 `vercel_visibility_silent_filter.md` 是同一族：那条讲应用层把非 public 条目静默过滤掉，这条讲**平台层把整个站点静默换成登录页**。共同点：**都不报错，都要求"看真实内容"才算验证**。
