# CodeBuddy CLI 穿透微信封闭生态提取公众号文章
type: capability
tool: CodeBuddy CLI (WorkBuddy)
scenario: 任何需要从微信公众号提取信息的调研
date: 2026-07-01
recipe: D:\workspace\research-methods\_tools\codebuddy-wechat-extract.md

## 能力

通过腾讯 CodeBuddy CLI 访问搜狗微信搜索，找到公众号文章后读取全文。CodeBuddy 是腾讯自家 CLI Agent，请求走腾讯基础设施，微信不拦截。

关键路径：CodeBuddy → 搜狗微信搜索（weixin.sogou.com）→ 搜狗跳转链接 → 公众号文章全文。

## 为什么只能用这个

| 方案 | 为什么不行 |
|------|-----------|
| WebSearch (Google/Bing) | 微信是封闭平台，不索引 mp.weixin.qq.com |
| WebFetch → 搜狗微信 | 触发反爬（antispider），302 而非真实 URL |
| Coze wx-extract | 已停用 |

**为什么 CodeBuddy 能过**：走腾讯基础设施，微信认为请求来自可信源。搜狗微信是唯一公开索引公众号文章的搜索引擎。

## 局限

- 租房帖的户型图和联系方式通常在图片里，文本提取拿不到
- 历史文章不标注"已租出"，需人工判断时效性
- 适合持续监控新帖，不适合考古

## 速查

```powershell
node "C:\Program Files\WorkBuddy\resources\app.asar.unpacked\cli\bin\codebuddy" -p -y --output-format text "请访问搜狗微信搜索 https://weixin.sogou.com/weixin?type=2&query=<URL编码关键词>，浏览搜索结果，进入相关文章读取全文，返回具体信息"
```
