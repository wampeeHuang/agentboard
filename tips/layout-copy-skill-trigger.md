# "抄网站"没触发 beautiful-html-templates 技能
type: diagnosis
date: 2026-06-14
source: coze.cn → 发版船 ReleaseShip 模板抄写

## 现象

用户给 URL + "抄" + "网站"，Agent 没调 `Skill: beautiful-html-templates`，自己手写 HTML 拼了一个不伦不类的版本，跳过了已有的 `layout-copy-standard.md` 标准流程。

## 根因

Agent 接到任务后直接动手，没检查可用技能列表。`beautiful-html-templates` 技能里已定义了完整的四层抄写模型（骨架/皮肤/节奏照抄，内容域彻底换域），Agent 完全没走。

## 修复/步骤

```
用户说 "URL + 抄" → Skill("beautiful-html-templates") 或直接引用 layout-copy-standard.md
```

抄写产出必须放 `templates/{slug}/` 下，含三个文件：
- `template.html` — 完整单文件 HTML
- `template.json` — 元数据（palette/typography/mood/tone/occasion）
- `design.md` — 设计文档（tokens + 骨架 + 组件清单）

内容域必须换域 — 不能和原站雷同。

## 预防

- 看到 URL + "抄" → 无条件走 beautiful-html-templates 流程
- 不自己发明流程，不走捷径
- 产出后跑画廊端到端验证（参见 `gallery-template-not-visible.md`）
