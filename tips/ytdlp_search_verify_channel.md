---
type: diagnosis
date: 2026-07-15
source: O3 Phase 02/03 yt-dlp channel search
---

# yt-dlp search 结果必须人工验证频道身份

## 现象
`ytsearch1:` 返回错误频道：
- ARTE → Arthur Officiel（喜剧频道，非公共电视台）
- Simple_History → OverSimplified
- RUSSKAYA_ISTORIYA → Тренажер по истории（考试培训频道）

## 根因
`ytsearch1:` 按 YouTube 相关性排序。小众频道、歧义关键词（ARTE = 艺术类通用词）、非拉丁字符查询 → 匹配不准。

## 修复
搜索后三验证：
1. `channel_name` 是否匹配预期（允许近似，不允许完全无关）
2. `subscriber_count` 数量级是否合理（预期百万级搜出千级 = 错了）
3. 视频标题是否匹配内容类型（搜历史纪录片搜出喜剧 = 错了）

不通过 → 用 `@handle` 直取或手动搜索URL。

## 预防
关键频道（头部/独占性高的）必须三验证。批量频道允许抽样验证。
