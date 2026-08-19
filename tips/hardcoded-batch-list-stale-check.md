---
type: diagnosis
date: 2026-08-17
source: 猫波信号站 pipeline 巡检修复（check_pipeline.py 的 check_feishu）
---

# 验证脚本硬编码批次清单会过期，每天都报假失败

## 现象

`check_pipeline.py` 每天跑巡检，`check_feishu` 检查飞书表格里今天生产视频的「生产日期」字段。某天起每天都报 `生产日期=..., expected 2026-08-14`，但飞书里数据明明是对的。

## 根因

校验脚本里硬编码了 5 个 slug（来自 08-11 那批）。它永远拿这 5 个 slug 去查飞书，对比它们的「生产日期」是否等于"今天"。换了日期，这 5 个 slug 还是旧批次的，生产日期当然不等于新日期 → 每天假失败。

表面看像"数据没更新"，实际是"代码里写死了一份旧批次快照"。数据是流动的，代码里那份是死的——两者迟早分叉。

## 修复

校验目标从"代码里的死清单"改成"本次运行自己的 checkpoint 的 completed 列表"：

```python
# 硬编码清单 → 动态从 checkpoint 读
cp = CURATION_DIR / f".checkpoint_{date_str}.json"
slugs = set(json.loads(cp.read_text(encoding="utf-8")).get("completed", []))
```

checkpoint 是每次运行的真实产物，天然就是"今天应该有哪些 slug"的唯一真相源。

## 预防

写校验/巡检脚本时，凡是"这批应该有哪些条目"这种列表，一律从当次运行的产物（checkpoint / manifest / 输入清单）派生，禁止硬编码某一天的快照。

判定信号：脚本里出现一份带具体业务标识的常量列表（slug、id、文件名），且这段代码会跨日期重复执行 → 这就是过期炸弹。改成"读当次输入"，而不是"抄上一次结果"。
