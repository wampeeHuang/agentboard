# `catch(_){}` 静默吞咽 = 状态悄悄损坏 + 故障不可解释
type: diagnosis
date: 2026-07-07
source: scheduler.js 186 次崩溃根因排查，发现 9+ 个 `catch(_){}` 全部丢弃诊断信息，状态损坏累积到不可解释

## 现象
- Node.js 常驻进程不崩溃（没有 uncaughtException），但行为异常
- 状态文件时好时坏（saveState 静默失败 → 下次 tick 用旧状态）
- 任务全部消失（loadAllJobs 静默失败 → 返回 [] → 没有任务可调度）
- 错误日志永远为空（logStderr 静默失败 → 诊断数据丢失）
- 8 次重启 19 分钟内 job_count=0（jobs.json 解析失败但错误被吞）
- 没有堆栈、没有日志、没有痕迹。只看现象猜根因

## 根因

`catch(_){}` 和 `catch{}` 主动销毁证据。"_" 命名暗示"我不关心这个错误"，但错误信息是唯一的诊断线索。

两类静默吞错叠加：

| 场景 | 示例 | 后果 |
|------|------|------|
| I/O 失败被吞 | `try { fs.writeFileSync(p, data); } catch(_){}` | 状态写失败不知道 |
| 解析失败被吞 | `try { JSON.parse(raw); } catch(_) { return []; }` | 静默回退空值 |

进程不崩（没有触发 uncaughtException handler），但内部状态逐 tick 偏离真相。最终表现出的故障（"为什么今天没跑任务"）和实际根因（"jobs.json 四天前就解析失败了"）之间差着 4 天的信息断层。

`uncaughtException` handler 解决崩溃无痕，但不解决这个问题——try/catch 已经捕获了，异常根本没到达 process 层。

**核心错觉：** "加个全局 crash handler 就行了" → 只能看到没被 catch 的错误。函数内部的 catch(_){} 把错误吃了，全局 handler 看不到，进程继续跑，状态慢慢坏。

## 修复/步骤

**1. 全局搜 `catch(_)` 和 `catch{}`，逐个替换**

```javascript
// 旧 — 静默吞错
try { fs.writeFileSync(path, data); } catch(_) {}

// 新 — 留痕
try { fs.writeFileSync(path, data); } catch(e) { writeCrashLog('saveState', e); }
```

**2. writeCrashLog 是最后一道防线**

```javascript
function writeCrashLog(tag, err) {
  var ts = new Date().toISOString();
  var msg = ts + ' [' + tag + '] ' + (err && err.stack ? err.stack : String(err || 'unknown'));
  try { fs.appendFileSync(CRASH_LOG_PATH, msg + '\n', 'utf-8'); }
  catch (e2) { console.error('[crash-log]', msg); } // 写到 console 是绝对兜底
}
```

即使 catch 块本意是"这个错误不影响主流程"，也要留一行日志。日志不是修复错误，是保留诊断能力。

**3. 区分三类 catch，不同策略**

| catch 场景 | 策略 |
|-----------|------|
| 状态写入失败（saveState） | 写日志 + 继续。下次 tick 重写 |
| 数据加载失败（loadState/loadAllJobs） | 写日志 + fallback 默认值。绝不静默返空 |
| 运行时清理失败（unlink/mkdir） | 写日志。清理失败通常不致命但需要知道发生过 |

**4. 不该加 catch 的地方删掉 catch**

```javascript
// 旧 — 返回空数组掩盖问题
try { return JSON.parse(fs.readFileSync(path)); } catch(_) { return []; }

// 新 — 返回空数组但留痕
try { return JSON.parse(fs.readFileSync(path)); } catch(e) { writeCrashLog('load', e); return []; }
```

## 预防
- 新项目上线前 `grep -rn "catch\s*(\s*_\s*)"` 搜一遍，逐个审查
- `catch(_)` 且块内无任何日志 = 红线。要么加日志，要么删 catch 让上层处理
- 代码审查时看到 `_` 变量名在 catch 里 = 问一句"这个错误你确认永远不需要看？"
- I/O 操作（fs/sql/http）的 catch 块必须有日志——I/O 错误有外部因素，不能假定永远不会失败
- 纯逻辑 fallback（"格式不对就用默认值"）可以吞错，但要写注释说明 fallback 行为是有意的
