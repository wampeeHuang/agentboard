# system-diagram.html 生成指令

从 SKILL.md 生成 `references/system-diagram.html`。用 `system-diagram/template.html` 做骨架，填充以下占位符。

## 填充规则

### `{{SKILL_NAME}}`
Skill 目录名。如 `evolution-cat-article`。

### `{{SKILL_DECK}}`
一句话描述，从 SKILL.md 的 `description` YAML frontmatter 提取。≤80 字。

### `{{KPI_STRIP}}`
3-5 个 KPI，选最有信息量的数字：
```html
<div><div class="kv">11</div><div class="kl">步骤</div></div>
<div><div class="kv">9</div><div class="kl">角色</div></div>
<div><div class="kv">11</div><div class="kl">红线</div></div>
```

### `{{PIPELINE_HEADING}}`
生产管线 / 执行流程 / 审计流程 — 根据 skill 性质选。

### `{{PIPELINE_STEPS}}`
每个 step 的结构：
```html
<div class="step"><div class="step-inner">
  <div class="step-num">1</div>
  <div class="step-body">
    <h3>步骤标题</h3>
    <div class="role">执行角色 · 参考文件</div>
    <div class="desc">做什么、怎么做、关键约束</div>
    <div class="out">→ 输出文件.md</div>
  </div>
  <div></div>
</div></div>
```

step-num 样式：
- 默认 `.step-num` — 普通步骤
- `.step-num.spawn` — spawn 子 agent
- `.step-num.pause` — 人审暂停点
- `.step-num.opt` — 可选步骤

门禁插入格式：
```html
<div class="gate-break">
  <div class="gtag">门禁 · 名称</div>
  <div class="gtitle">门禁标题</div>
  <div class="gitems">
    <span class="gi">① 条件1</span>
    <span class="gi">② 条件2</span>
  </div>
  <div class="gdetail">补充说明</div>
</div>
```
门禁样式：`.gate-break`(红色/杀稿)、`.gate-break.eng`(蓝色/工程)、`.gate-break.warn`(黄色/警告)

暂停标记：
```html
<div class="pause-marker">
  <div class="plabel">⏸ 人审暂停 · 位置说明</div>
  <div class="ptext">暂停后做什么</div>
</div>
```

### `{{FOLDER_TREE}}`
从 SKILL.md 的目录结构块提取，用 `.dir`(目录)、`.file`(文件)、`.comment`(注释) 标记：
```html
<div class="row lv1"><span class="dir">skill-name/</span></div>
<div class="row lv2"><span class="pre">├── </span><span class="file">SKILL.md</span></div>
<div class="row lv2"><span class="pre">├── </span><span class="dir">references/</span></div>
<div class="row lv3"><span class="pre">│   ├── </span><span class="file">production-sop.md</span></div>
<div class="row lv3"><span class="pre">│   └── </span><span class="file">system-diagram.html</span></div>
```

### `{{SIDEBAR_PANELS}}`
1-3 个侧边栏面板（类型表/角色表/约束列表/风格规则等）。每个面板：
```html
<div class="panel">
  <div class="panel-head">面板标题</div>
  <!-- 表格或列表内容 -->
</div>
```

### `{{FLOWCHART_SECTION}}`
可选。交付物链流程图：
```html
<div class="panel clean" style="margin-bottom:36px">
  <div class="panel-head">交付物链</div>
  <div class="fc-row">
    <div class="fc-node"><div class="fc-box">Step1<br>名称</div><div class="fc-sub">说明</div></div>
    <div class="fc-arrow-h">→</div>
    <div class="fc-node"><div class="fc-box">Step2<br>名称</div><div class="fc-sub">说明</div></div>
    <!-- ... -->
    <div class="fc-spacer"></div>
  </div>
  <div class="fc-wrap-arrow">↓</div>
  <!-- 可多行 -->
</div>
```

### `{{ADDITIONAL_SECTIONS}}`
可选。完整宽度的附加章节（信念网格、决策分支表等）。

### `{{STAT_BAR}}`
5 个底部统计卡片：
```html
<div class="sc">
  <div class="sn">11</div>
  <div class="sl">步骤</div>
  <div class="sdetail">说明</div>
</div>
```

## 核心原则

1. **先读 SKILL.md 再写**。图是 prompt 的视觉翻译，不是独立创作。
2. **保持 CSS 不动**。只改内容，不改 var() 变量和 class 结构。
3. **信息层级一致**：hero → pipeline(左) + sidebar(右) → flowchart → stat-bar。
4. **数字精确**：KPI 和 stat 数字来自 SKILL.md 真实数据。
5. **输出路径**：`<skill-dir>/references/system-diagram.html`。
