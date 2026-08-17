# 跨语言移植：逐块对比控制流结构，不只测功能

type: pitfall
date: 2026-08-02
source: admin.html matchOne — Python→JS 移植子串匹配块嵌套错误

## 现象

JS 版 matchOne 将 115/203 行 BOM 物料归入 unknown，Python 版归入 cheap。
功能测试（单条 C0402）因测试数据不覆盖子串匹配路径而通过，未暴露 bug。

## 根因

Python 源码结构：
```python
if fp_base and fp_base != fp_norm:  # Block A
    ...
if fp_base:                          # Block B (独立)
    ...
```

JS 移植错误地将 Block B 嵌套进 Block A：
```javascript
if (fpBase && fpBase !== fpNorm) {  // Block A
    ...                              // Block B 错放在这里
}
```

## 修复

```javascript
if (fpBase && fpBase !== fpNorm) {  // Block A
    ...
}
if (fpBase) {                        // Block B (独立)
    ...
}
```

## 预防

跨语言移植控制流代码时：
1. 源码和目标的控制流结构逐块对比（缩进/括号层级）
2. 不只跑功能测试 — 构造覆盖每条路径的对比测试
3. Python `if a and b:` + 后续 `if a:` 是高频陷阱 — 两块缩进相同但逻辑独立
