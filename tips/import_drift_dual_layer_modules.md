# Import 漂移：双轨模块间的静默断裂

type: pattern
date: 2026-07-30
source: 猫波信号站 validate_cover.py import MIN_TITLE_PX 不存在，生产全挂

## 现象

生产管线 preflight check 报 `Validator 模块缺失: validate_cover.py (注册于 manifest)`，但文件存在。实际是 validate_cover.py 内部 import 链断裂——`from cover_design import MIN_TITLE_PX` 失败，因为 cover_design.py 里已改名为 `MIN_TITLE_FS`。

## 根因

双轨模块（生产层 cover_design.py + 验证层 validate_cover.py）共享导出名。生产层改了变量名，验证层没同步。验证层通过 `importlib.import_module()` 延迟加载，ImportError 被 catch 后包装成模糊的"模块缺失"——真实原因被吞。

## 修复

1. 验证层 import 语句对齐生产层导出名
2. 派生变量同步更新

## 预防

- `importlib.import_module()` catch ImportError 时打印真实 traceback，不吞错误
- 双轨模块在 manifest 里标注依赖关系，preflight 做交叉校验
- CI/提交门禁跑 `preflight --check-deps` 而非等到生产时才发现
