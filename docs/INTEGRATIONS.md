# 外部入口与集成规范

> 目的：把「密钥中心」「GitHub 仓库管理」「同步飞书/同步仓库」这类个人入口从源码里拿出去，变成**配置 + 通用接口**；同一套外壳给不同用户时装什么、连什么由本机配置决定。

## 1. 两类入口，别混在一起

### Link-only（推荐先做）

只是一个外部 URL，不持有凭据，不执行动作。

```json
{
  "links": [
    {
      "id": "key-management",
      "label": "密钥管理中心",
      "url": "https://example.feishu.cn/base/...",
      "icon": "feishu-base.png",
      "openInNewTab": true
    }
  ]
}
```

- 配置：`DATA_ROOT/config/links.json`
- 接口：`GET /api/links` → `{ ok, links: [{id,label,url,icon,openInNewTab}] }`
- 外壳只负责渲染：标签、图标、是否新标签页都来自配置；未配置就整块隐藏。
- URL 只允许 `http(s)`；图标只允许本地 `svg/png/webp` 文件名；不存 token。
- 旧 `state/private-links.json` 的 `keyManagementUrl` 只作为兼容映射；新代码不读它。

### Connector（同步/动作，含凭据）

有外部账号、权限和写操作，例如「同步飞书」「同步仓库」。

- 配置：`DATA_ROOT/config/integrations.json`（或各工具自己的 `state/`）
- 接口：`GET /api/integrations` 返回脱敏状态（`enabled/configured/status/actions`），不返回密钥。
- UI 只在 `configured && enabled` 时显示动作按钮；未配置不显示，而不是点了才报错。
- 凭据只走环境变量/系统 keychain；配置里只保存**环境变量名**，例如：

```json
{
  "id": "feishu-base",
  "label": "飞书多维表格",
  "provider": "feishu",
  "config": { "appIdEnv": "FEISHU_APP_ID", "appSecretEnv": "FEISHU_APP_SECRET" },
  "actions": [{ "id": "sync", "label": "同步飞书" }]
}
```

- Web 端永远不接触 App Secret / tenant token；同步在服务端执行。
- 这个版本先落地能力地图的 `{links,sync}` 配置；完整 connector 插件层是下一步。

## 2. 成熟做法参考（外部调研）

| 参考 | 可迁移的点 |
|---|---|
| [Home Assistant — Building integrations / Config flow](https://contributors.home-assistant.io/core/integrations/config-flow/) | 每个集成有 manifest；用户在 UI 里完成 config flow，验证通过才生成 config entry；不要在每次启动重复校验/重复添加。 |
| [Raycast — Preferences](https://developers.raycast.com/api-reference/preferences) | 扩展在 manifest 声明 preferences；必填项在打开命令前由用户补齐；密钥走用户偏好/系统钥匙串。 |
| [VS Code — SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) | 扩展的 token 存 SecretStorage，不写 settings.json；本机应用对应 OS keychain / 环境变量。 |
| [12-Factor App — Config](https://12factor.net/config) | 配置与代码严格分离；易变配置进环境变量；代码库可以立即公开而不泄露敏感信息。 |
| [Electron — app.getPath](https://www.electronjs.org/docs/latest/api/app#appgetpathname) | 用户数据放 `userData`，不要写安装目录；升级/卸载不丢数据。 |
| [Tauri — appDataDir](https://v1.tauri.app/v1/api/js/path/) | 数据目录按 `${dataDir}/${bundleIdentifier}` 解析，跨平台一致。 |
| [GitHub Apps — installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) | 用 App 安装令牌/细粒度权限，不在代码里放 PAT；令牌可过期、可回收。 |
| [飞书 — tenant_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/tenant_access_token) | App ID/Secret 只在服务端；tenant token 缓存、按 `expires_in` 续期；不写前端/安装包/日志。 |
| [n8n — Credentials](https://docs.n8n.io/credentials/) | 凭据类型与工作流分离，运行时注入；同一套工作流可换连接。 |

采用结论：

- **链接** 与 **连接器** 分开；前者是纯数据，后者有状态/凭据。
- **配置进数据目录，凭据进环境/钥匙串**；仓库只带示例。
- **未配置就隐藏**，而不是显示一个必然失败的动作。
- **配置声明能力**（`actions` / `sync`），外壳按能力渲染；未来加 provider 不改页面。
- **不账号化**：单用户本地；远程/团队另做认证层。

## 3. 当前实现

### 工具架（:3099）

- `lib/links.js`：读取 `config/links.json`，做 URL/图标/长度/去重/数量限制；`state/private-links.json` 仅兼容。
- `server.js`：`GET /api/links`；`GET /api/private-links` 保留旧形状一个版本。
- `web/index.html`：`#externalLinks` 容器；`web/_script.js` 渲染 `.external-link`；不再有飞书图标/文案的硬编码。
- 本机 `config/links.json` 由旧配置迁移；`config/` 已进 `.gitignore`。
- 工具架 UI：搜索栏右侧的 `＋` 打开「外部入口」弹窗；标签 / URL / 图标 / 新标签页，保存走 `POST /api/links`，删除走 `DELETE /api/links/:id`，都写同一份 `config/links.json`。未配置时只显示 `＋`，不显示空白链接。
- 侧栏底部「存储地图」同时显示外部入口数量和 `config/` 路径，回答“我的资产在哪”。

### 能力地图（:3110，独立仓库）

- `state/links.json`：`links`（GitHub 仓库管理入口）+ `sync`（飞书/仓库同步的开关、标签、提示）。
- `server.js`：`privateLinks()` 返回 `{ links, sync }`；链接不再校验飞书域名；未配置时返回空；同步能力按配置下发。
- `web/_script.js`：入口和同步按钮由 `capData.privateLinks` 渲染；未配置不显示；标签/提示来自配置；按钮类名从 `feishu-base-link` 改为 `cap-link`。
- 同步 provider（`/api/feishu-sync`、`/api/github-sync`）仍是原实现；这次是壳与配置解耦，不是 provider 重写。

### 迁移与兼容

- 旧 `state/private-links.json` 保留；新配置优先。
- 旧工具架 UI 的 `/api/private-links` 形状保留一个版本，避免外部脚本立刻断。
- 新增配置示例见 `examples/config/links.example.json`。

## 4. 下一步（按优先级）

1. 把 `integrations.json` 做成正式 schema + `/api/integrations`，能力地图的同步改为 connector 注册。
2. 凭据接 OS keychain（Windows Credential Manager / macOS Keychain），配置只存引用。
3. GitHub App / 飞书 OAuth 的安装/授权流程；token 过期与撤销。
4. 配置校验与诊断页：`agentboard doctor` 打印 app/data 根、配置状态、缺失 env。
5. 公开外壳前做一次示例脱敏与数据根初始化演练。
