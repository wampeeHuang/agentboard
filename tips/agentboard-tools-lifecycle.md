# Agentboard 工具生命周期
type: reference

工具在 Agentboard 上的完整生命周期：

## 注册
- Agent 在 `~/.claude/tools/<id>/` 下创建 `manifest.json`
- 刷新工具架页面或调用 `GET /api/tools` 即可发现
- 不需要重启 server，文件落盘即生效

## 启动
- `POST /api/tools/start/:id` 触发 `startCommand`
- 启动前自动扫描端口冲突：如果目标端口已被其他工具占用，拒绝启动
- 启动后轮询端口状态直到确认运行

## 停止
- `POST /api/tools/stop/:id` 触发 `stopCommand`
- 轮询确认端口释放

## 下架
- 删除 `~/.claude/tools/<id>/` 目录即下架
- 无数据库、无 YAML、无残留配置
