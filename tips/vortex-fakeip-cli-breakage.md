# Vortex fake-ip 只代理浏览器，CLI 工具全断
type: diagnosis
date: 2026-06-12
source: curl/npm/git/node 全部超时，浏览器正常

## 现象
浏览器能上网，但所有 CLI 工具（curl、npm、git、python、node）访问任何外网都超时。`WebSearch` 工具却正常——因为它走 Anthropic 服务器，不经本机。

## 根因
Vortex（Clash 内核）开了 fake-ip DNS 劫持但 TUN 关闭。三层叠加：

1. **DNS 层**：Vortex 劫持所有域名到 `198.18.0.1/16`（假 IP），只有代理能路由这些地址
2. **代理层**：Vortex 只设了 Windows 系统代理（`127.0.0.1:7897`），只有浏览器看系统代理
3. **CLI 层**：curl/npm/git/node 不看系统代理，只看 `HTTP_PROXY` 环境变量——而这个变量之前没设

结果：CLI 解析域名 → 得到假 IP → 直连假 IP → 超时。

之前（2026-06-11）尝试改 DNS 为 `normal` 模式，但配置文件被 Vortex 覆盖回去。

## 修复

三个选项，按推荐度排序：

1. **开 TUN 全局模式**（推荐）：Vortex 开 TUN，所有流量透明代理，不用各自配置。浏览器和 CLI 都能通，关了也能直连。
2. **设 HTTP_PROXY 环境变量**：临时可用，但关代理时会干扰直连，需手动删除。
3. **不用 Vortex**：退出 Vortex，删环境变量，DNS 恢复自动获取。

当前的临时修复是设了用户级 `HTTP_PROXY=http://127.0.0.1:7897`（已删除）。

## 预防
- 判断 CLI 能不能上网 → 先 `curl -v https://www.baidu.com`，看是 DNS 错还是连接错
- DNS 错（`198.18.0.x`）= fake-ip 在跑，要么开 TUN 要么设代理变量
- 连接错但 DNS 对 = 代理端口没开或没设代理变量
- 不碰 `config.yaml` 的 DNS 模式——Vortex 会覆盖
