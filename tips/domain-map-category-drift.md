# 分类映射表未覆盖实际值 → 筛选静默空白
type: diagnosis
date: 2026-07-09
source: 工具架模型分类筛选点下去全空，数据里 category 用 "本地模型"/"远程模型" 但 domainMap 只映射 "模型"

## 现象
筛选栏 "模型" pill 计数 > 0，但点击后卡片区空白。其他分类正常。看起来像有工具匹配但没渲染。

## 根因
`domainMap` 是 category → domain 的映射表，未映射的 category 会 fallback 到默认值（"职能"）。数据里的 category 字段用了更细的值 "本地模型" 和 "远程模型"，但映射表只有顶层的 "模型"。

```
用户点击 "模型" 筛选 → domainFilter='模型'
工具 category='本地模型' → domainMap['本地模型']=undefined → fallback '职能'
'职能' !== '模型' → 被筛掉
```

领域 pillar counts 不受影响（计数逻辑也走 domainMap，但 fallback 后被归入其他分类，pill 已算入 "模型" 的计数），造成"计数有但点进去空"的反直觉现象。

## 修复/步骤
1. `curl localhost:3099/api/tools | grep category` 列出所有实际 category 值
2. 确保每个值都在 `domainMap` 里有显式映射
3. 同步更新 `catMeta`（分类悬停解释）和 `catOrder`（排序权重）
4. 不要依赖 fallback 默认值——每个 category 值都显式写映射

## 预防
- manifest category 字段新增值时，必须同步更新前端三处映射表
- 在 `server.js` 或 manifest schema 里加校验：category 值必须在 catMeta 的 key 集合里
- 分类值是数据契约，不是自由文本。改前先搜 `domainMap`、`catMeta`、`catOrder` 确认覆盖面
