---
type: capability
date: 2026-07-15
source: O3 Phase 03 MiniCPM-V fix scripts
---

# 修复脚本写入前检查已有有效数据

## 现象
v3 `fix_o3_simple_qa.py` 覆盖了 v1 已成功产出的 Terra_X_History PASS 结果 → 变成 FAIL/UNKNOWN。

## 根因
`_result.json` 回写时无脑覆盖。未检查 `status == "SCREENED"` 且 `minicpmv_raw` 含有效JSON。

## 修复
修复/重跑脚本写入前加守卫：
```python
if record.get("status") == "SCREENED" and record.get("minicpmv_raw"):
    try:
        json.loads(record["minicpmv_raw"])
        print(f"  SKIP: {slug} already has valid result")
        continue
    except:
        pass  # 无效JSON → 允许覆盖
```

## 预防
任何"修复/重试"类脚本，第一步读已有数据，第二步判断是否真的需要修。不假设"重跑一定更好"。
