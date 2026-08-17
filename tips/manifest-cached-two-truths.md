# 配置缓存 = 双真相源：读磁盘，不缓存配置对象

type: diagnosis
date: 2026-07-31
source: Supervisor 缓存 manifest → 工具架改 disabled 不生效

## 现象
- 工具架改 manifest（disabled/autoStart/port），Supervisor 面板不感知
- 只有重启 Supervisor 才生效
- 代码里说"manifest 是唯一真相源"，实际有两个真相源（磁盘 + 内存）

## 根因
`loadManifests()` 启动时把 manifest JSON 对象存入内存 Map。之后 14 个函数从 `services.get(id).manifest` 读配置——永远是启动时的快照。

这不是性能优化（`readFileSync` 读小文件 <1ms），是设计错误——隐式缓存没有声明自己是缓存。

## 修复
1. `services` Map 只存运行时状态：`{dir, process, restarts, startTime, status}`
2. 新增 `readManifestById(id)` — 每次调用从磁盘读最新 manifest
3. 所有需要 manifest 的函数改调 `readManifestById()`

```javascript
function readManifestById(id) {
  const s = services.get(id);
  if (!s) return null;
  const mfPath = path.join(TOOLS_DIR, s.dir, 'manifest.json');
  let raw = fs.readFileSync(mfPath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const m = JSON.parse(raw);
  m.id = m.id || s.dir;
  return m;
}
```

## 预防
- 配置文件 = 磁盘是真相，内存只是副本。副本必须声明：标注来源路径 + 读取时刻
- 进程管理器场景：启动时只扫描服务列表（id→dir 映射），运行时决策从磁盘读完整配置
- 看到 `services.set(id, {manifest, ...})` 并存的写法 → 警觉。不同写者可能持有不同字段集
- 诊断方法：改 manifest 某一个字段 → 调 API 看是否生效 → 不生效 = 有缓存层

## 伴随 Bug：Map 条目字段覆盖

`loadManifests()` 写 `{dir}`，`start()` 写 `{manifest, process, ...}`。两个 `services.set()` 写同一 key，对象形状不同，后者把 `dir` 清零。`readManifestById` 中 `s.dir` → undefined → 崩溃。

预防：共享 Map 多写者必须约定统一字段集。只有一个位置负责 `services.set()` 的完整条目。
