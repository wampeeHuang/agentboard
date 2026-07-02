# HANDOFF 2026-07-02

## 已做
- **codex 502 排查** — 根因是 codex-relay(:4446) 未启动，Vortex 代理回 502。已启动恢复
- **tool-registry.js 四修** (d082784)：
  1. 端口+进程双重验证（tasklist 交叉比对，端口 LISTENING 但进程不在 → running=false）
  2. startTool 端口轮询（spawn 后等最多 5 秒，端口不 up 报失败）
  3. netstat 失败记 opslog（不再静默吞）
  4. tasklist 批量缓存（一次调用服务所有工具）
- **tip 落库** — `port-listening-not-means-running.md`

## 未做
- tips/manifest-silent-drop.md 有之前未提交的改动，未混入本次 commit
