---
type: diagnosis
date: 2026-07-30
source: 猫波信号站 pipeline.py 缺少 B站合规检查，三条视频全跳过敏感词扫描
---

# 多入口脚本门禁不同步：一个加了另一个没加

## 现象

`orchestrator.py` 有 B站合规门禁 (`check_bilibili_compliance.py`)，`pipeline.py` 直接 ②→⑧ 没有。绕过 orchestrator 跑 pipeline = 合规检查静默跳过。三条视频全部通过 `validate_outputs.py` 但从未扫描敏感词。

## 根因

两条平行执行路径，新门禁只加了一条。`pipeline.py` 是直接入口（bypass curator），`orchestrator.py` 是完整入口。新增步骤时只改了一个文件，没有 grep 确认所有入口覆盖。

## 修复

`pipeline.py` `run_pipeline()` 在翻译后加合规门禁：
- exit 0 = 通过
- exit 1 = 阻断（红线命中）
- exit 2 = 警告但继续（写 compliance_report.txt 给发布面板）

## 预防

任何新增门禁/检查步骤，改完后跑这行确认覆盖：

```
grep -rn "新脚本名" --include="*.py" .
```

不止看主流程，还要查 cron job、Makefile、package.json scripts 等所有入口。如果有些入口故意不加，写注释说明原因。
