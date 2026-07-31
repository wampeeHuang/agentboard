# 同端口双 manifest → supervisor 死锁，禁用一个后 dead 不消失
type: diagnosis
date: 2026-07-31
source: 巡检面板报警 supervisor 托管服务 catalog:3104 dead，restart_count=4

## 现象
1. 巡检面板 supervisor 项报错：`DEAD: 1 services - catalog:3104`
2. `netstat -ano` 显示端口 3104 在 LISTENING
3. Supervisor API 显示一个服务 running，另一个 dead（restart_count 已到上限）
4. Agentboard 两个 manifest（`catalog` 和 `project-catalog`）都声明 port 3104

## 根因
两层：

**层1 — 端口争抢**: 两个 manifest 指向同一端口同一代码（`D:\tools\catalog\server.js`）。Supervisor 先启动一个占了端口，后启动的 bind 失败被标 dead，反复重试耗尽 MAX_RESTARTS。

**层2 — supervisor 只增不删**: `loadManifests()` 只检查 `if (services.has(m.id)) continue` 然后新增，从不删除已禁用的服务。即使 manifest 设了 `disabled: true`，start() 会跳过，但服务留在 services map 里保持 dead 状态，巡检永远报警。只有重启 supervisor 才能清除。

## 修复/步骤
1. 通过 agentboard `/api/tools` 查同端口注册：查 port 字段重复的 manifest
2. 禁用一个：加 `"disabled": true` + `"conflicts": ["另一个id"]`
3. 双向加 conflicts：另一个 manifest 也补上冲突声明
4. Supervisor API stop 止住残影：`POST /api/stop {"id":"xxx"}`
5. 验证：`curl localhost:3097/api/status` 无 dead

长期需修 supervisor —— loadManifests() 或 healthCheck 应移除 disabled=false 且 status=dead 的服务。当前只能等 supervisor 重启。

## 预防
- 新增 manifest 前先搜索目标端口是否已被注册：`grep -r "\"port\": 3104" ~/.agentboard/tools/`
- 禁止同一代码库注册两个 manifest 指向同端口——若需要别名用 `id: "xxx"` 同 manifest 内修改，不建第二个
- 双 manifest 已在 `catalog`/`project-catalog` 加 conflicts 互斥，未来再犯会被 agentboard 挡
