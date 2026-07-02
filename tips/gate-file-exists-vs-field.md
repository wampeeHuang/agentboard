# 状态机推导：文件存在 ≠ 通过

type: anti-pattern
date: 2026-07-02
source: evolution-cat 管线架构修复，对抗性审查

## 现象

pipeline-state.py 推导阶段时，用 `os.path.exists(gate_result_file)` 判断 gate 是否通过。gate-1-result.md 存在但内容为 🔴 杀（KILL），管线仍推进到阶段二。

## 根因

`evidence['gate1_md'] = file_exists(...)` 只验证文件存在，不读内容/不读 PASS 字段。阶段一→二的过渡条件漏了 `gate1.get('passed')` 校验。后续阶段（二→三、三→四）用了 `.get('passed')` 但阶段一漏了。

## 修复

每个阶段过渡条件同时检查：
1. 证据文件存在
2. 对应 gate 结果的 `passed` 字段为 `true`

另加 `.abandoned` 标记文件作为兜底信号（文件存在性比内容解析更可靠）。

## 预防

写状态推导引擎时，对每个 stage transition 写单元测试：伪造 gate 文件存在但 passed=false → 断言 stage 不推进。不要只测 happy path。
