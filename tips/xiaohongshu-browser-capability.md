# Chrome DevTools 浏览小红书搜索+评论区挖掘
type: capability
tool: Chrome DevTools MCP
scenario: 任何需要从小红书提取中文社区信息的调研（租房、选品、用户反馈等）
date: 2026-07-01
recipe: D:\workspace\research-methods\_tools\xiaohongshu-browser-scout.md

## 能力

用 Chrome DevTools MCP 在小红书网页版搜索关键词、浏览帖子列表、进入单帖展开评论区。最关键的能力是**评论区挖掘**——求租/求助帖下的评论区常隐藏高价值信息，这些不在主 feed 流里出现。

## 为什么只能用这个

- 小红书没有公开 API
- 第三方抓取工具不稳定
- 网页版搜索结果与 App 一致，浏览器操控不会被识别为爬虫
- 评论区内容是 JS 动态加载，WebFetch 拿不到

## 速查

```
navigate_page → https://www.xiaohongshu.com/search_result?keyword=<关键词>
wait_for(text=["笔记"], timeout=10000)
take_snapshot → 读帖子列表
click(帖子) → wait_for(text=["评论"]) → take_snapshot → 读评论区
```

**陷阱**："光明"可能是佛山桂城（跨城同名），标题关键词≠实际位置。必须点进帖子确认。
