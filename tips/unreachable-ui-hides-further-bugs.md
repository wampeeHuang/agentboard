---
type: lesson
date: 2026-09-13
source: 灵感图库 L4.1「分类界面可达」——面板修好后才发现里面是空的，且"取消选择"永远取消不掉
---

# 够不到的界面背后，藏着第二、第三个 bug

## 现象

调用链清单里只写了一个原因（入口按钮恒 `hidden`）。真把入口打开之后，
面板**里面什么都没有**，而且"全部领域"按钮按下去没反应。

## 根因（同一处功能，三个独立缺陷）

1. **入口被隐藏**：`trigger.hidden = true` 恒隐藏，面板宽度 0。
2. **渲染函数从未被调用**：`renderReferenceFilterNav()` 定义齐全、样式齐全，
   但没有任何地方调用它 → 面板是空壳。因为面板长期 0 宽，**没人看见过它是空的**。
3. **渲染函数带副作用**：`renderReferenceHeroNav()` 在渲染过程中
   `LIB.selectedDomains = [第一个领域]` 并写 localStorage。而它是
   `refresh() → renderWall() → renderReferenceHeroNav()` 的一部分，
   于是"清空筛选 → 刷新 → 又被填回"变成死循环：
   **用户永远取消不掉一个自己没选过的筛选条件**，还会被静默持久化。

## 修复/步骤

- 按视图分派渲染：`项目库 → renderProjectNav()` / `参考库 → renderReferenceFilterNav()`。
- **渲染函数只读不写**：显示当前状态，不修改状态、不落盘。改筛选只由用户动作触发。
- 顺带补一条成对的恢复：`if (toolbar && isSystemList) toolbar.style.display = 'none'`
  的对侧必须有 `if (toolbar && !isSystemList) toolbar.style.display = ''`——
  内联 `display:none` 的 CSS 管不着，缺了它元素"在 DOM 里可见、在屏幕上不可见"。

## 预防

- **修复"够不到"之前，先假设它后面还压着东西**：一个长期不可达的功能，
  它的缺陷不会被任何人发现，所以缺陷数通常 ≥ 清单里写的数量。
  修完必须做**内容断言**（面板里有几个领域/几项），不能只断言"元素可见"。
- **给可达性写测试时，断言要落在"人能做什么"上**：按钮可见 → 面板真的有宽度 →
  面板**有内容** → 点它能改变结果 → 还能撤销 → 刷新后状态一致。
  只断言 `element.isVisible()` 会让 2、3 两条继续隐身。
- 渲染函数里出现赋值/持久化就是气味；`render*()` 应当是纯的。
