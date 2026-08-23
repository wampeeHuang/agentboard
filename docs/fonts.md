# 字体决策名单

本文件是字体选用的唯一真相源。改动前先看这里，避免重复引入已放弃的字体。

## 选入（想要的）

| 角色 | 字体 | 栈位置 | 备注 |
|------|------|--------|------|
| 英文 | **Inter** | 首选 | 现代无衬线，gallery 同款 |
| 中文 | **宋体** | fallback 链 | Noto Serif SC（思源宋体）→ Source Han Serif SC → SimSun |

统一栈：

```
font-family: Inter, 'Noto Serif SC', 'Source Han Serif SC', SimSun, serif;
```

- 英文全部走 Inter；中文字符 fallback 到宋体系（Noto Serif SC 未装则 SimSun）
- 全站仅此一种栈，不另立第二字体
- 2026-08-23 确认：英文 Inter + 中文宋体

## 放弃（禁引入）

| 字体 | 放弃原因 | 曾用于 |
|------|---------|--------|
| **Cascadia Code** | 风格卡通（圆润/连字装饰） | dashboard 原字体栈 |
| **Consolas** | 等宽代码感，与 Inter 方案冲突（过渡尝试） | dashboard 过渡栈 |
| **Microsoft YaHei / Noto Sans SC** | 黑体无衬线，中文字体定为宋体后弃用 | dashboard 过渡栈 |

## 原则

- 引入新字体前查本名单。名字出现在「放弃」栏 → 不引入，改用栈内现有字体
- 字体栈改动必须同步更新本文件，不允许代码先行
