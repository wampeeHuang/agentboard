# 模板写入 _index.json 但画廊页面看不到
type: diagnosis
date: 2026-06-14
source: coze.cn → 发版船 ReleaseShip 模板抄写，用户连续三次"找不到"

## 现象

`curl -X POST http://localhost:3080/update` 返回 `{"ok":true,"count":101}`，`_index.json` 里确认有对应条目，但用户在画廊 UI 里搜不到对应模板。

## 根因

两种可能，按频率排序：

1. **浏览器缓存了旧版 `_index.json`** — 画廊前端 `fetch('generated/_index.json')` 获取数据，浏览器可能返回磁盘缓存（304），不带上新条目。用户看到的还是旧数据。

2. **模板放在 scanner 扫描不到的路径** — server.js 的 scanner 只扫描 `CLAUDE.md` 或 `SKILL.md` 所在的 skill 目录下的 `templates/`，放在别处不会被索引。

## 修复/步骤

端到端验证，三步缺一不可：

```
1. 确认模板在正确路径：~/.claude/skills/<skill>/templates/<slug>/template.html
2. curl -X POST http://localhost:3080/update  → 确认 count 增加
3. 浏览器打开 localhost:3080 → Ctrl+Shift+R 强制刷新 → 搜模板名 → 确认卡片可见
```

第三步不可跳过。`_index.json` 有 ≠ 用户能看到。

## 预防

- 加模板后必做第三步（浏览器实际确认），不在第二步就报完成
- 如果用户反馈"看不到"但 _index.json 有 → 第一个怀疑浏览器缓存，让用户硬刷新
- scanner 要求：CSS ≥500 chars，HTML 含 `<section>` 标签或 slide 结构
