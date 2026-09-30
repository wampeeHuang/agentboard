---
type: diagnosis
date: 2026-09-24
source: 宋连达品牌项目——用一个 py_compile 批量校验脚本查语法错，脚本报「31 通过 / 0 失败」，实际有 1 个文件语法错误
---

# py_compile 传 quiet=2 会让 doraise 失效：校验器被参数静默关掉

## 现象

写了个批量语法校验脚本，用 `py_compile.compile(p, cfile=..., doraise=True, quiet=2)` 遍历目录。
输出「语法通过: 31 个 / 语法失败: 0 个」，全绿。但同一批文件里明明有一个 `SyntaxError`
（之前直接运行该文件时解释器报过错）。

**校验器没有漏检——它根本没在检查。**

## 根因

CPython 3.11 的 `py_compile.compile()` 里，`quiet >= 2` 会在 `doraise` 判断**之前**提前 return。
于是 `doraise=True` 形同虚设，异常既不上抛也不打印，函数正常返回。
调用方收到"无异常"，判定为通过。

实测四种组合（Python 3.11.9）：

| 参数 | 结果 |
|---|---|
| `doraise=True` | 正确抛出 PyCompileError |
| `doraise=True, quiet=2` | **不抛（漏判）** |
| `doraise=True, cfile=...` | 正确抛出 |
| `doraise=True, cfile=..., quiet=2` | **不抛（漏判）** |

## 修复/步骤

1. **不要传 `quiet`**。只用 `doraise=True`。
2. 修完必须**用已知会失败的文件反向验证一次**——拿一个故意写坏语法的文件喂给校验器，确认它真的报错。
   校验器"全绿"只有在它能对已知失败报红时才有意义。
3. `except` 分支要同时捕获具体异常与 `Exception`，避免"参数不合法导致 TypeError 被吞"这类二次失效。

## 预防

- **任何校验器落地后，都要拿一个已知的坏样本做反向测试。** 通过的校验器不证明被校验物没问题，
  只证明"校验器没报错"——这两件事只有在校验器本身被验证过之后才等价。
- 传可选参数前先查它在本版本的确切语义（`inspect.signature` / 源码），不要按参数名猜行为。
- 与 `verification-gate-vacuous-pass.md` 是同一族问题：那条讲"跳过 ≠ 通过"，这条讲
  **"参数能让校验器静默失效"**。共同点是——安全网的失效本身必须是可见的。
