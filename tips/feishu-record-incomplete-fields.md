# 选题入库缺字段 → 手工补数据引入新错误
type: diagnosis
date: 2026-06-26
source: 猫波信号站新一轮选题入库，6 条记录缺标题/播放量/点赞，补标题时填了英文

## 现象

1. 6 条新选题通过 `lark-cli base +record-upsert` 入库飞书，只填了 Slug/URL/摘要/评分/日期/来源/状态
2. 缺少字段: `标题`（中文）、`YouTube播放量`、`YouTube点赞`
3. 补数据时，`标题` 填了 YouTube 英文原标题（如 "Tony Fadell: How to build real taste..."）
4. 飞书"标题"字段约定是中文（已有 12 条记录全是中文标题，格式: `身份+姓名：主题概括`）

## 根因

1. **管线缺 stage_①** — 项目有 ②(download)→⑯(CDP upload) 但选题入库没有脚本。每次手工拼 JSON，字段漂移不可避
2. **手工操作不校验** — 没有对照已有记录的字段模式，没有输出前必填校验
3. **约定在数据里不在代码里** — "标题=中文"的约定只有飞书数据本身能看出来，没有文档或校验

## 修复

1. 6 条记录手工修正为中文标题，补全 YouTube播放量/YouTube点赞
2. 创建 `tools/stage_01_topic_onboard.py`，一刀切：yt-dlp 自动拉 YouTube 元数据，`--title` 必填+中文字符检测，所有必填字段输出前校验

## 预防

任何需要写飞书记录的操作，优先用 `stage_01_topic_onboard.py` 而非手工拼 JSON：
```
python tools/stage_01_topic_onboard.py \
    --url "https://youtube.com/watch?v=XXX" \
    --title "中文标题（身份：主题）" \
    --guest "Guest Name" --source "Channel" \
    --summary "一句话中文摘要" \
    --timeliness N --exclusivity N --authority N --longevity N \
    --create
```

手工拼 JSON 时，至少对照已有记录过一遍字段清单：Slug/URL/标题(中文)/嘉宾/来源频道名/中文摘要/日期/YouTube播放量/YouTube点赞/时效性/独占性/人物权威/长期价值/总分/状态。漏一个 = 欠债。
