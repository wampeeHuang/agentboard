# 直接写 manifest 文件绕过 API schema 校验
type: diagnosis
date: 2026-07-25
source: OmniRoute 注册到工具架时，Write 工具直写 manifest.json，category 填了不存在的 "AI基础设施"，API 校验门禁被绕过

## 现象
manifest.json 直接写到 `~/.agentboard/tools/{id}/` 目录，category 填了不在 CATEGORY_VALUES 中的值。API 返回该工具（因为 scanTools 不校验 schema），但前端筛选/计数异常——领域 pill 不显示、domainMap 无映射导致工具被归入 fallback 领域。API 校验门禁形同虚设。

## 根因
校验门禁在 API 层（`createTool` / `updateTool` → `schema.validate()`），不在文件系统层。`scanTools()` 扫描 manifest 文件时不做 schema 校验——它只读 JSON，不验证字段合法性。

直接写文件 = 绕过所有 gate：
- category 不合法 → 不报错，文件照读
- owner 不合法 → 同上
- type 不合法 → 同上
- 缺必填字段 → 同上（scanTools 用 `|| ''` 兜底）

同类模式也存在于 scheduler（`jobs.json`）——直接编辑文件绕过 CLI 的字段校验。

## 修复/步骤
1. 工具注册走 `POST /api/tools`（或 `PUT /api/tools/:id`），不走文件系统直写
2. 如果必须直写文件（如 API 因 schema 缓存未刷新而拒绝合法值），写完后立即验证：确认卡片在 `GET /api/tools` 中可见，category/owner 值正确
3. schema 文件修改后需重启 agentboard 进程（Node require 缓存），否则 API 校验仍用旧规则

## 预防
- AI agent 注册工具 → 用 MCP `agentboard_create_tool` 或 `curl POST /api/tools`，不直写文件
- 读 manifest-schema.js 的 CATEGORY_DEFINITIONS 匹配分类，不凭直觉编分类名
- 排查"卡片不可见/数字不对"时，先怀疑 category 不合法，检查 CATEGORY_VALUES
