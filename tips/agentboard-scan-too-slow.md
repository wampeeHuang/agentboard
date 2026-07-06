# agentboard /api/tools 响应慢→分层缓存+跳过无效I/O

type: diagnosis
date: 2026-07-06
source: 工具架53个工具，点刷新响应~1s、偶发8s

## 现象
`GET /api/tools` 响应 1-8 秒。`netstat -ano` 50ms、manifest 读取 100ms——都不是瓶颈。`tasklist /FO CSV /NH` 占了 800ms。

## 根因
两重：
1. `CACHE_TTL = 500`（0.5秒）—— manifest 扫描、端口检查、进程检查全共享同一个 TTL。点"刷新"间隔超过 0.5 秒就全量重扫，等于没缓存
2. `tasklist` 每次都跑——进程列表变化远慢于端口变化（进程不会秒级启停），但和端口检查同频率刷新，800ms 白白浪费

附加浪费：`extractMeta()` 对每个有 projectPath 的工具读 `index.html` 提取 `<title>`。但所有 manifest 都已有 name+description，读到的数据从不使用。

## 修复
1. `CACHE_TTL` 500→5000ms（manifest 扫描缓存 5 秒）
2. 新增 `PROC_CACHE_TTL = 30000`（进程列表独立缓存 30 秒）
3. `extractMeta` 加前置判断：`mf.name` 和 `mf.description` 都有值时跳过

## 效果
| 场景 | 修前 | 修后 |
|------|------|------|
| <5s 内再次刷新 | ~1s | ~2ms |
| 5s-30s | ~1s | ~40ms |
| >30s 首次 | ~1s | ~0.9s |

## 预防
- 给 `scanTools` 加东西前先测耗时（`Measure-Command` 或 `time`）
- 不同变化频率的数据用不同 TTL——别共用一个常量
- 读外部文件提取数据前先检查目标字段是否已经填了
