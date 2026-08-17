# 门禁阈值需区分样品/全片模式，不能共用一套标准
type: diagnosis
date: 2026-08-10
source: film-translation Mimino 变体B管线 — Gate 4 用全片阈值（100MB/时长差≤5s）检查样品（54MB/180s）

## 现象

样品（180s/54MB）通过烧录，Gate 4 报 FAIL：文件太小（<100MB）、时长差 5304s（180s vs 5485s）。门禁用全片标准衡量样品产物。

## 根因

Gate 4 设计时只有全片模式。Phase 3 加了样品管线，但门禁未同步更新——同一个 gate 函数对两种模式用同一套阈值。

文件名嗅探 `_sample_` 是临时方案，不如显式传模式 flag。

## 修复

1. 检测文件名中的 `_sample_` 标记，样品用放松阈值（10MB、时长≤源即可）
2. pipeline.py 已有 mode 信息，应通过 `--mode sample|full` flag 显式传给 gate-check.py

## 预防

- 管线加新模式（sample/staging/canary）时，逐条审查所有 gate 的阈值假设
- Gate 函数接受显式 mode 参数，不做文件名模式匹配
- 阈值表按 mode 分列写在 gate 配置中，不硬编码在函数体内
