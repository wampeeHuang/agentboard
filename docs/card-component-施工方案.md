# 卡片组件化 + 全量读 施工方案

> 目标：工具架卡片从「想标注就标注」变成固定槽位组件，manifest 从「agent 手写」变成数据契约。架构上让工具架挖不出漏洞来。
> 配套原型：`_runtime/card-prototype.html`（10 卡 5 槽，浏览器已打开可对照）。
> 日期：2026-08-21

---

## 0. 原则（为什么这么改）

1. **全量读，静默不存在。** `tools/` 下每个目录 = 一张卡，必有明确状态，状态必可见，状态必有恢复路径。
2. **单写门。** 所有写入（面板/API/MCP）走 validate + 原子写。正常路径产生的 manifest 不会坏；坏的一定是外部篡改，而全量读把它显性暴露。
3. **组件化倒逼规范化。** 卡片槽位硬要求 manifest 字段，同 Obsidian SCHEMA 硬要求 frontmatter。缺字段 → 不完整状态卡 + 列出缺口，不是空白卡。

---

## 1. 地面真值（实测 2026-08-21）

| 项                 | 值                                                                            |
| ----------------- | ---------------------------------------------------------------------------- |
| `tools/` 目录数      | **68**                                                                       |
| 有 manifest 的目录    | 66                                                                           |
| 非工具条目             | 2：`_runtime/`（内部运行区，含自动 CHECKPOINT.md，gitignored）+ `.git/`（tools/ 自建 git 仓库） |
| 根级文件              | 3：`.gitignore`、`CHECKPOINT.md`、`README.md`                                   |
| 当前 /api/tools 卡片数 | 66（scanTools 静默丢游离/内部条目）                                                     |

**2026-08-21 实测修正**：原稿写"游离 1：`_runtime/`、改造后 66→67"——方向错了。total-read 配合排除规则（`_` 前缀 + `.` 前缀 + 文件名，见 §5）后，`_runtime/` 和 `.git/` 都被跳过，**卡片数保持 66**，不增。total-read 的价值不是 +1 卡，是「静默丢 → 显性暴露」：manifest 损坏的目录不再悄悄消失，而是渲染成 broken 红卡。验收断言改为：`/api/tools` 卡片数 == 真工具目录数（66），且任一 manifest 损坏都出现红卡（不再静默）。

**2026-08-22 文件真相源修正（前置，S1 前必须先做）**：实测 `web/index.html` 是**自包含单文件**（内联 `<style>` 15.8K + 内联 `<script>` 33.4K），`web/_style.css` 和 `web/_script.js` 是**孤儿死文件**——`lib/static.js:11` 每次请求只读 index.html，从不读分离文件。此前对 `_style.css` 的 S1 编辑验证为零效果，正因如此。agent.md 声明的 `web/` 三文件架构与实际严重漂移（index.html 内联版更新更全）。

**决策 B（2026-08-22 已执行 + 验证）**：恢复分离文件为真。

1. 备份 index.html → `_runtime/index.html.bak-s0`
2. Node 脚本按标签边界提取内联 CSS/JS → 覆盖 `_style.css`（15785B）/ `_script.js`（33393B）
3. index.html 改为 `<link href="/_style.css">` + `<script src="/_script.js">`，保留 `<!--STATS_SNAPSHOT-->` 占位
4. 浏览器验证：66 卡、无渲染报错，与内联版一致 ✓
5. S1 目标文件 `_style.css` 现在**是活文件**，后续编辑全部生效

**S0 CSS token 化（并入本次，前置 S1 状态 CSS）**：用户要求「token 取出，不硬编码」（参考 `D:\workspace\layout-gallery\templates\layout-gallery` DTCG 模型）。实测 `_style.css` 30 色 / 65 处，仅 13 在 `:root`，**21 处硬编码**（状态色、语言色、按钮态）。S1 新增状态 CSS 前先收编，避免二次返工。契约草案已对齐分组（ink/surface/text/status 9 色/lang 语言色/shadow/radius/spacing），待用户确认落盘 `docs/css-token-contract.md`。

---

## 2. 数据契约：卡片槽位 ↔ manifest 字段

每张卡 = 固定 5 行槽位，从上到下。空槽不消失，显示 `—`（1 行占位）。

| 槽位          | 渲染内容                    | 数据来源                                          | 规则                          |
| ----------- | ----------------------- | --------------------------------------------- | --------------------------- |
| **P0 身份**   | mono 方块 + name + id     | `name`（必填）+ 目录名                               | mono = name 首字              |
| **P1 状态**   | 状态字 chip + 状态点          | scanTools 运行时计算（不落盘）                          | 双显：字 + 色，色盲可读               |
| **P1 meta** | 端口 / trigger / 文件夹      | `port`/`ports`/`trigger`/`type`               | 空 → `—`                     |
| **P2 标签**   | category + owner + form | `category`（必填 10 值）`owner`（必填）`form`（派生）      | `capability` 进 tooltip 不进槽位 |
| **P3 描述**   | 3 行 clamp               | `description`（必填 ≥10 字 含【用途】）                 | 空 → `—`                     |
| **P4 动作**   | 打开/启动/停止/恢复 + 禁用 toggle | `startCommand`/`stopCommand`/`url` + 当前 state | 按 state 派生                  |

**Obsidian 同构对照**：SCHEMA.md 硬要求 frontmatter（title/created/updated/type/status/tags）因为 wiki 模板需要这些字段；manifest 硬要求（name/description/capability/owner/category）因为卡片槽位需要。**字段不出现 = 卡片不出现 → 字段即存在。**

`capability` 不进槽位但进校验（maxLen 30 已存在）——每个 manifest 字段必须映射到「槽位」或「校验」，无孤儿字段。

**2026-08-21 对抗性审查修复**：`schema.TYPE_VALUES` 已加 `'api'`（此前 3 个纯 API 工具——figma-mcp 等——无类型被默认 `service`，卡片显示启动按钮但无法启动 = 真 bug）。表单 5 类型（service/cli/api/folder/group）现全部 schema 合法。

---

## 3. 状态枚举 & 恢复路径

`scanTools` 对每个目录返回 `state`（枚举），前端只读它渲染，不再靠条件分支猜。

| state                  | 色     | 含义                      | 恢复动作（P4）                  |
| ---------------------- | ----- | ----------------------- | ------------------------- |
| `running`              | 绿     | 三段验证通过                  | 打开 / 停止                   |
| `stopped`              | 灰     | 未运行                     | 启动                        |
| `start_failed`         | 红     | 启动超时/进程随即退出（端口从未活跃）     | 查看日志 + 重试启动               |
| `starting` / `halting` | 蓝 / 橙 | 过渡态（前端轮询）               | —                         |
| `broken`               | 红     | manifest JSON 解析失败      | **修复 manifest**（面板重建）     |
| `incomplete`           | 琥珀    | validate() 失败           | **补全字段**（表单预填已有字段，高亮缺口）   |
| `orphan`               | 紫     | 无 manifest 的非内部目录       | **注册为工具**（新建表单，目录预填）      |
| `stale_path`           | 棕     | projectPath 声明但不存在且用于启动 | **迁移路径**（表单改 projectPath） |
| `disabled`             | 灰·半透明 | disabled=true           | 重新启用 toggle               |

每卡附带：`stateDetail`（人话，如「缺 name · description」）+ `recovery`（动作 id）+ `missingFields`（incomplete 专用）。

---

## 4. 分步施工（每步带验证）

### S1 CSS 宽度：1080 → 1800，5 列

`web/_style.css`：

- 全部 `max-width:1080px` → `1800px`：行 17（header-top）、27（header-philo）、30（toolbar）、47（content）、122（filter-bar）、134（section-label）、137（principles-bar）、145（footer）、155（section-divider）、162（call-stats-bar）、176（domain-hint）
- 行 48 `.tool-grid`：`minmax(280px,1fr)` → `minmax(320px,1fr)` → 1800−64 内边距 = 1736px 可用 → 5 列 × ~340px
- 行 49 `.tool-card`：`height:230px` → `264px`（5 行槽位）
- 新增多态状态 CSS（dot 色 + status-chip + 顶边色），直接抄原型 `card-prototype.html` 的对应类

**验证**：打开 :3099，宽屏 5 卡/行；filter 条/原则区同宽，无比例失调。

### S2 scanTools 全量读（核心）

`lib/tool-registry.js:299`。现状：

```js
try { mf = JSON.parse(read(mfPath)); } catch (e) { return; }  // 静默丢
if (!mf || !mf.name) return;                                   // 静默丢
```

改：**不 return**，全量分类。

```
for dir in tools/*:
  if 内部目录（下划线前缀，如 _runtime）→ 跳过（声明过的内部，见 §6）
  if 无 manifest.json        → state=orphan
  else parse 失败            → state=broken
  else validate(mf) 失败     → state=incomplete（附 missingFields）
  else projectPath 声明且不存在且用于启动 → state=stale_path
  else disabled              → state=disabled
  else 三段进程验证           → state=running / stopped
  每卡: {state, stateDetail, recovery, missingFields}
```

返回兼容 `/api/tools` 现有字段（前端其它逻辑不动），**新增** `state/stateDetail/recovery/missingFields`。前端随后只读新字段。

**验证**：卡片数 == 真工具目录数（66，`_`/`.`/文件全排除）。破坏任一 manifest（如截断 JSON）→ 该卡变 broken 红卡，不再静默消失。这是可数字断言。

### S3 原子写

`lib/tool-registry.js:723`（createTool）及 updateTool。现状 `writeFileSync(mfPath, ...)`——崩溃 → 半截 JSON → broken。
改：

```js
const tmp = mfPath + '.tmp';
writeFileSync(tmp, data, 'utf8');
renameSync(tmp, mfPath);   // 同盘 rename 原子
```

**验证**：注入 fs 失败（mock 写 tmp 后不 rename），旧文件完好。

### S4 _script.js render 重构

`web/_script.js:387-472`。替换条件渲染（行 466 meta 三元链、行 467 desc 只在存在时渲染）为固定槽位 builder：

```js
renderCard(t) {
  const state = classify(t);        // 读 scanTools 返回的 state
  return [P0, P1(状态chip+meta), P2(标签), P3(desc/占位), P4(动作/恢复)].join('');
}
```

- 空槽 → `<span class="card-placeholder">—</span>` 固定 1 行
- 子类型保留：组卡（cron 子状态点进 P1）、CLI（meta 显示 trigger，P4 显示「在 Claude Code 中输入」）、文件夹（meta 显示「文件夹」，P4 显示「查看项目」）
- 拖拽排序 / 禁用 toggle / 打开态逻辑不动，只改结构

**验证**：:3099 实卡对照原型 —— 9 种状态均有卡，恢复按钮可达，组卡/CLI/文件夹不回归。

### S5 人写面板（最后一个漏洞）

- 后端：`POST /api/tools`（新建）、`PUT /api/tools/:id`（编辑），复用 `manifest-schema.validate()` 门禁 + S3 原子写
- **先修 registry bug：`createTool` 丢 children**（children 不在 `BASE_FIELDS`，组工具经 createTool 建会丢子工具）——`BASE_FIELDS` 补 `children`，再建组工具才完整
- 前端：index.html 顶部加「新增工具」按钮（现状无任何添加入口）；P4 恢复按钮打开表单（新建/编辑/补全/迁移/修复），表单字段 = REQUIRED_ALL + 可选字段，提交走 gate
- 人不再手写 JSON。agent 写的 manifest 与面板写的走同一条 validate 门

**验证**：表单建一个临时工具 → /api/tools 可见 → 停用 → 用户确认后删。

---

## 5. 排除规则（游离目录判定）

判定顺序：非目录（文件）→ `_` 前缀 → `.` 前缀 → 其余无 manifest = orphan。

- **非目录跳过**：`tools/` 根级文件（`.gitignore`、`README.md`、`CHECKPOINT.md`）不是工具，直接跳过。
- **`_` 前缀 = 内部目录，跳过**：`tools/_runtime/`（自动 CHECKPOINT、gitignored）。复用仓库根 `_runtime` 惯例。
- **`.` 前缀 = 隐藏/版本控制目录，跳过**：`tools/.git/`（tools/ 自建 git 仓库的内部目录）。实测 2026-08-21 发现，原稿漏了。
- 其余无 manifest 目录 = orphan，P4 显示「注册为工具」+「删除」（删除需用户确认，红线）。

---

## 6. 风险 & 边界

| 风险                           | 缓解                                 |
| ---------------------------- | ---------------------------------- |
| 66 工具在线，render 重构破坏拖拽/组卡/CLI | S1 先 CSS 后 JS（S4）；JS 保留拖拽/组卡逻辑只改结构 |
| stale_path 误报                | 只对「声明 projectPath 且用于启动」判，纯查询目录不误伤 |
| orphan 误报（残留目录）              | 显示但不自动删；删除走用户确认                    |
| 宽度放大后其它区块比例失调                | 全部 1080→1800 一起改，非只改 grid          |
| 组卡/CLI/文件夹差异                 | 设计为「槽位不变、内容变」的子类型，不是第二种卡片          |

---

## 7. 验收清单

1. [x] 1800px 下 5 卡/行，原型与实卡一致（S4 浏览器验证：5 列/66 卡/264px）
2. [x] /api/tools 卡片数 == 真工具目录数（66）；破坏 manifest → broken 红卡（不静默）（S2 + S5 broken-repair 实测：坏 JSON → state=broken → PUT 修复 → 200）
3. [x] 9 种状态有卡展示，恢复按钮可达（S4 原型验证 + 实卡 s-* 类）
4. [x] 表单建工具不经手写 JSON（S5 端到端：表单建 s5 → /api/tools 可见 → 编辑 PUT → confirm 删除）
5. [x] 原子写：模拟崩溃旧文件完好（S3 验证）
6. [x] 组卡/CLI/文件夹子类型不回归（S4：11 张活 CLI 卡实卡验证；组/文件夹代码路径保留）
7. [x] manifest 字段 → 槽位/校验全映射，无孤儿字段（表单字段取自 manifest-schema FIELD_RULES/REQUIRED_ALL）
8. [x] `/api/tools` 现有消费者（MCP 工具、AI 路由）兼容不破（REST shape 未变，reorder 原子写往返验证）

**S5 实测补充（2026-08-22）**：过程中修掉两个表单 bug —— ① slugify 自动 id 被 `f-id.value !== ''` 守卫冻结在首字符（改回只认 `idTouched`）；② buildManifest 空端口时拼出「调 :端口」（service 返回兜底改为 `:端口`/本地服务）。

---

## 8. 决策（2026-08-21 用户拍板）

1. **状态枚举 9 种**：加独立 `start_failed`（启动失败）态，不再归入 stopped。§3 表已补。
2. **1800px / minmax(320px)** → 5 卡/行。
3. **排除规则认可**（下划线前缀跳过），按 §5 实测修正执行（含 `.` 前缀 + 非目录）。
4. **人写面板入本次**：全表单（新建/编辑/补全/迁移/修复 一套）+ `POST/PUT /api/tools` + BASE_FIELDS 补 children。
