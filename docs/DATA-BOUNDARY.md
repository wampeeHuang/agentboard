# 应用层 / 数据层边界

> 目标：同一份代码带一个空数据根也能启动；个人卡片、外部入口、同步凭据不进入应用仓库。当前作者机已把数据收进 `~/.agentboard/data/`：`APP_ROOT = ~/.agentboard`，`DATA_ROOT = ~/.agentboard/data`，边界由路径模块强制执行。

## 1. 两个根

| 层 | 内容 | 位置 | 进 Git？ | 谁写 |
|---|---|---|---|---|
| **应用层** | `server.js`、`lib/`、`web/`、`docs/`、`examples/`、`scripts/`、`package.json` | `APP_ROOT`（仓库/安装目录） | 是 | 开发者 |
| **数据层** | `tools/`、`apps/`、`tips/`、`principles/`、`state/`、`config/`、`_runtime/`、`archive/`、`skills/` | `DATA_ROOT`；默认 `APP_ROOT/data`（`~/.agentboard/data`），由 `agentboard.config.json` 指向，`AGENTBOARD_HOME` 可覆盖 | 否 | 用户/运行时 |
| **内容层** | 我的网站、经验日志、原则库卡片；宪法/契约文件 | `DATA_ROOT/{apps,tips,principles}` | 卡片否；`CONSTITUTION.md` 是应用契约，随仓库保留 | 用户 |
| **集成层** | 外部入口 URL、同步开关、凭据引用 | `DATA_ROOT/config/links.json` + 环境变量 | 否 | 用户 |
| **运行态** | API 调用日志、命令快照、PID、事件流、草稿 | `DATA_ROOT/{state,_runtime}` | 否 | 服务/工具 |

`lib/paths.js` 是唯一路径真相源：`APP_ROOT`、`DATA_ROOT`、`TOOLS_DIR`、`APPS_DIR`、`TIPS_DIR`、`PRINCIPLES_DIR`、`STATE_DIR`、`RUNTIME_DIR`、`CONFIG_DIR`、`ARCHIVE_DIR`、`LOCAL_SKILLS_DIR`、`GLOBAL_SKILLS_DIR`。后端不再用 `__dirname/_runtime` 或仓库根写运行数据。

## 2. 当前默认与干净安装

**UI 入口**：侧栏底部「应用与数据」只呈现两张文件夹行——应用文件夹、个人数据文件夹——和一个明确的「未解耦 / 已解耦」状态；只提供打开文件夹（`/api/reveal`），不显示计数。数据来自只读的 `GET /api/boundary`（路径 + sameRoot），不包含凭据。

**作者当前机（已解耦）**

- 应用壳在 `C:\Users\Administrator\.agentboard`；数据包在 `C:\Users\Administrator\.agentboard\data`。
- `data/` 是唯一数据根：`tools/ apps/ tips/ principles/ config/ state/ _runtime/ archive/ skills/ _knowledge_base/`；`data/agentboard-data.json` 是包清单。
- `agentboard.config.json` 是当前数据包指针；工具命令用 `${AGENTBOARD_DATA}`，脚本通过 `AGENTBOARD_DATA` 环境变量取数据根。
- 个人卡片留在 `data/`，整体 gitignored；旧 `state/private-links.json` 由 `links-v1` 迁移到 `data/config/links.json`，旧文件保留为备份。

**给别人 / 新机（干净外壳）**

```bash
git clone https://github.com/wampeeHuang/agentboard.git ~/agentboard
cd ~/agentboard
npm install
npm run init     # 只补目录、宪法、examples；已有数据不覆盖
npm start
```

- 应用在 `~/agentboard`，数据默认在 `~/agentboard/data`；也可以把 `agentboard.config.json` 的 `dataRoot` 指到 `D:/agentboard-data`。
- 想与现有数据根共存时，先备份 `~/.agentboard` 再启动；服务只读/写 `DATA_ROOT`，不写应用目录。
- 数据包搬迁：停 dashboard 后 `npm run data:move -- D:\AgentboardData`；只复制 `data/`、切换指针，不删除旧数据。
- `npm run init` 会复制三份宪法和 `examples/` 两个工具模板；重复执行不覆盖。

## 3. 启动迁移（数据层，非前端）

- `server.js` 启动时在 `paths.ensureDataDirs()` 之后执行 `lib/migrations.js`；不依赖前端触发。
- 每条迁移有幂等标记：`DATA_ROOT/state/migrations/<id>.json`；旧文件保留为备份（如 `private-links-v1.backup.json`）。
- `links-v1`：把旧 `state/private-links.json` 的链接卡片写入当前 `config/links.json`；前端只读 `/api/links`，不显示旧格式、迁移按钮或兼容状态。
- 迁移失败不阻断服务，日志可见，下次启动重试；旧文件不删除。

## 4. 账号化：当前不做

- 单用户、本地优先：只监听 `127.0.0.1`，不要求登录；数据按 OS 用户隔离。
- 不做账号/多租户的原因：当前价值是本地工具控制面；账号会引入会话、密码、重置、权限与迁移成本，却不解决当前用户的痛点。
- 若未来要远程/团队：在反向代理层加认证，或做独立的 Team Server（RBAC、审计、远程 agent），不把登录硬塞进单机面板。
- 红线：外部入口/同步凭据不能进仓库；Web 端不持有 App Secret / tenant token。

## 5. 耦合清单（修了什么）

| 位置 | 修前 | 修后 |
|---|---|---|
| 工具/项目/日志/原则路径 | 默认仓库根；`__dirname` 混用 | `lib/paths.js` 统一到 `DATA_ROOT` |
| 应用运行态 | `__dirname/_runtime`、`__dirname/state` | `DATA_ROOT/_runtime`、`DATA_ROOT/state` |
| 本地技能 | `PROJECT_DIR/skills` | `DATA_ROOT/skills` |
| apps 注册表 | `path.join(__dirname,'..','apps')` | `DATA_ROOT/apps`（保留 env 测试钩子） |
| 归档设计/工程文档 | `PROJECT_DIR/archive` | `DATA_ROOT/archive` |
| 个人卡片 | `apps/`、`tips/`、`principles/` 入库（595 个） | 从索引移除；只保留宪法/契约 |
| 密钥中心入口 | HTML 写死飞书图标+文案；服务端只认飞书域名 | `config/links.json` → `/api/links` → 通用渲染；旧文件由启动迁移，运行时不再读 |
| 能力地图入口/同步 | 写死「GitHub仓库管理」+ 飞书图标；同步按钮常显 | `state/links.json` → `/api/capabilities.privateLinks` 的 `{links,sync}`；未配置不显示 |
| 账号 | 无 | 无；已写明决策 |
| 审计 | schema 1 错、affine 停命令误报、4 类分类告警、树 3 文件缺失 | schema 0 错 0 警、tree 0、brand/card/docs 通过 |

外部入口/连接的规范见 [INTEGRATIONS.md](INTEGRATIONS.md)。

## 6. 仍然存在的边界债（诚实列出）

1. **Git 历史**仍含旧的个人卡片；当前只是停止继续跟踪。要彻底从公开历史移除，需要重写历史并强推，属于破坏性操作，未做。
2. **外部数据根**：当前 `data/` 在应用根内，目录树与 tree-drift 已覆盖；若把 `dataRoot` 指到应用根之外（如 `D:\AgentboardData`），tree-drift 仍只扫 `APP_ROOT`，需要扩展为同时扫 `DATA_ROOT`。
3. **能力地图的同步 provider** 仍是飞书/GitHub 专用实现（`/api/feishu-sync`、`/api/github-sync`）；这次做的是入口/开关/文案的配置化，不是完整 connector 插件层。
4. **文档与示例**仍带有作者机器路径/案例；公开分发前需要再脱敏一轮。
5. **团队/远程**没有认证、RBAC、多租户；当前不承诺。

## 7. 验证

- 空 `DATA_ROOT` 启动：`tools=0, apps=0, links=0, principles=0`，目录自动创建。
- `npm run init` 后：`tools=2`（hello-server、nextjs-app），宪法复制成功，已有数据不覆盖。
- 当前机：`tools=122, apps=11, tips=573, principles=21`；外部入口 1 条（密钥管理中心），能力地图入口/同步从配置渲染。
- `npm test` 10/10；能力地图 58/58；`/api/audit` schema 0 错 0 警、tree 0、brand/card/docs 通过。
