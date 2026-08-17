# 富化/同步阶段的语义边界：元数据 vs 运营数据
type: anti-pattern
date: 2026-07-29
source: 猫波信号站 日期漂移 bug — sync_feishu_to_curation.py 富化路径覆写 date

## 现象
富化阶段无条件 `c["date"] = date_str_f`，把飞书日期直接盖到策展文件上。策展 agent 写出正确 YouTube 发布日期 → 飞书数据一脏全脏。

## 根因
富化（enrichment）语义是"补充 transient 数据"——播放量、点赞数、状态。日期不是 transient 数据，不应在富化阶段被覆写。

## 修复
富化只更新 views、likes、status 三个字段。删除 date/vpd 覆写逻辑。

## 预防
同步/富化阶段写代码前，先定义三类字段边界：
- **元数据**（date、slug、URL）——系统写入，富化不碰
- **运营数据**（views、likes、engagement）——外部拉取，富化覆盖
- **控制字段**（status）——双方写入，合并规则需显式定义
