# argparse default 覆盖管线意图：不传flag ≠ 全量处理
type: diagnosis
date: 2026-08-10
source: film-translation Mimino 变体B管线首测 — 全片模式输出180s样品

## 现象

管线在全片模式不传 `--max-t`（`sample_duration=None` → 跳过参数追加），脚本 argparse default=180，全片被截断为 180s。

## 根因

管线通过"不传 flag"表达"全量处理"，脚本通过 default=180 表达"默认只处理前 180s"。两个子系统对"缺省值"的语义假设相反：

```
管线意图:  --max-t 缺失 → 全片
脚本实现:  --max-t 缺失 → default=180 → 180s
```

这不是巧合——4 个变体 B 脚本有 3 个 set default=180（burn_cn.py、translate_and_filter.py、extract_yt_entries.py）。只有 gen_filter_cn.py 用了 `default=None` 逃过。

## 修复

```python
# 错误：default 是"样品时长"
parser.add_argument('--max-t', type=float, default=180)

# 正确：default 是"全量"（管线显式收窄）
parser.add_argument('--max-t', type=float, default=99999)
```

## 预防

- 管线脚本的 argparse default 必须设为"最大范围/全量"，由管线通过显式传参收窄
- 管线设计文档标注：每个 flag 的"不传"语义必须与脚本 default 语义一致
- 脚本有 `--max-t` / `--limit` / `--count` 类截断参数时，设置 `default=float('inf')` 或等价的极大值
