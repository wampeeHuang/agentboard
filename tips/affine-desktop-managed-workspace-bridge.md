---
type: capability
date: 2026-10-11
domain: general
author: codex
source: 灵感图库画布联动与删除恢复实测，2026-10-11，AFFiNE 0.27.4
tool: affine-workspace-service
scenario: 本地业务应用让人和 AI 共同创建、管理 AFFiNE 桌面画布
---

# AFFiNE 桌面可由受管后台提供创建与生命周期入口

## 能力
桌面继续承担编辑，本地 AFFiNE 后台提供可同步工作空间；业务应用用同一 API 支持人工按钮和 AI 创建画布，并联动移入回收站、恢复及彻底删除。

## 为什么采用这个组合
原生 affine:// 链接只解决打开已有文档，不能代替创建接口；浏览器仍可能弹外部应用授权。不要把“能跳转”误报成“可创建、可双向同步”。本次使用认证后的 Socket.IO/Yjs 同步协议适配固定 0.27.4；不是稳定官方写入 SDK，升级必须回归。

## 速查
版本源码：D:/workspace/_lab/2026-09-01-灵感墙/integrations/affine/。
部署目录与账号不等于源码；凭证仅存在部署的 .private/connection.json，不进入 Git、manifest、日志。
创建用唯一 request_id，重试复用原 ID。生命周期必须以 workspace_id + document_id 定位，不能凭标题或任意链接删除。
先落本地恢复材料，再提交远端状态并独立回读。失败/超时可能已在远端生效，应保留未完成记录、允许幂等重试，禁止到期清理吞掉恢复入口。
0.27.4 回收站字段是 trash/trashDate；桌面 removeDoc 的彻底删除语义是移除文档元数据，不能承诺擦除备份或历史快照。

## 验证边界
实测人工 UI 删除→恢复→再删除→彻底删除，并用独立后台连接回读；不把单向管理说成监听桌面端的双向同步。图片互通需另行验证。
