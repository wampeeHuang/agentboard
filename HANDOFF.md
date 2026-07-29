# HANDOFF · 2026-07-25

## 本次完成
- OmniRoute 本地部署 + 工具架注册（category=远程模型，API Key 已备份飞书）
- Schema 补充 `公开站` 分类（CATEGORY_VALUES + CATEGORY_DEFINITIONS）
- index.html 领域映射同步（domainMap + pill 列表，公开站不显示为领域 pill）
- 新增 tip: manifest-disk-write-bypasses-api-validation.md
- Git commit: `7974e9b` — schema + html + tip

## 新增文件
- `~/.agentboard/tools/omniroute/manifest.json` — OmniRoute 卡片（端口20128）
- `~/.agentboard/tips/manifest-disk-write-bypasses-api-validation.md`
- `~/.claude/.../memory/reference_omniroute.md` — OmniRoute 备查
- `D:\workspace\_output\retrospectives\2026-07-25-omniroute-toolrack-registration.md`

## 未完成
- **agentboard 进程未重启**（PID 18116 Protected Process），manifest-schema.js 的 `公开站` 校验缓存未刷新
  - 影响：API createTool/updateTool 仍拒 `公开站` category
  - 不影响：dechpcba 正常显示，scanTools 不校验 category
  - 解法：系统重启或 admin 权限 taskkill

## 当前状态
- 工具架 57 个工具，51 正常 + 6 已停用
- 领域分类全部合法
- OmniRoute 已停止，`omniroute` 启动

## 仓库状态
- agentboard 仓库 1 个未推送 commit（`7974e9b`），其余大量历史未提交变更未触碰
