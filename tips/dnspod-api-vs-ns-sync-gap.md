# DNSPod ModifyRecord API 返回成功但权威 NS 不更新，等 5-10 分钟或删重建触发同步

type: diagnosis
date: 2026-07-21
source: 德城 landing page 部署，dechpcba.evopearl.com CNAME 记录修改后 Google DNS/权威 NS 持续返回旧值

## 现象

- DNSPod `ModifyRecord` API 返回 `{RecordId: ...}` —— 修改成功
- `DescribeRecordList` API 查询显示新值已生效
- 但 Google DNS (`8.8.8.8`) 仍返回旧值或 NXDOMAIN
- 权威 NS (`june.dnspod.net` / `porpoise.dnspod.net`) 也返回旧值
- 持续 5-10 分钟后才同步

同样的问题也出现在 `CreateRecord` → 记录在 API 中存在且 ENABLE，但权威 NS 完全不知道这条记录。

## 根因

DNSPod 的 API 数据库和权威 NS 之间不是实时同步的。API 修改操作只写入了 DNSPod 内部数据库，向权威 NS 的推送有延迟。

极端情况下（本次遇到两次），修改操作可能永远不触发 NS 同步——API 显示正确但 NS 就一直不更新。机制不明，推测 DNSPod 内部有某种同步队列或去重逻辑，某些操作序列会被跳过。

## 修复/步骤

### 方案 A：等待（适用于非紧急）

等 5-10 分钟，NS 通常会追上。用权威 NS 直接查询确认：
```bash
nslookup -type=CNAME <域名> june.dnspod.net
nslookup -type=CNAME <域名> porpoise.dnspod.net
```

### 方案 B：删重建强制同步（适用于 API 显示正确但 NS 超过 10 分钟不更新）

```python
# 1. 删除旧记录
DeleteRecord(Domain, RecordId)
# 2. 等 2 秒
time.sleep(2)
# 3. 创建新记录（相同参数）
CreateRecord(Domain, SubDomain, RecordType, RecordLine, Value)
# 4. 立刻验证 NS
nslookup <域名> june.dnspod.net
```

删重建触发了新的 NS 推送事件，而 ModifyRecord 可能因为某种原因被跳过。

### 方案 C：ModifyRecord 后再调一次无变化 ModifyRecord

有时第二次 ModifyRecord（即使用相同参数）能触发之前卡住的同步。推测是某种重试/刷新机制。

## 预防

- DNS 记录创建/修改后 **立刻** 用 DescribeRecordList 回查验证值是否正确（防字符级输入错误）
- 然后查权威 NS 确认已推送
- Google DNS 有缓存（TTL 时长），如果时间紧用权威 NS 确认，不依赖 Google DNS
- CreateRecord 后不要假设 API 返回的 RecordId 对应的记录值就是你要的值——回查验证
- 同样的同步问题在 DeleteRecord 上也可能出现：API 删除成功了但 NS 还返回旧数据
