# 手动维护的凭证表必然腐烂，定期审计是唯一解法

type: method
date: 2026-08-05
source: 飞书凭证表全量审计——42 条记录 17 条有问题（40% 腐坏率）

## 现象

飞书多维表格存了 42 条凭证记录，看起来齐全。实际核查发现：
- 6 条源文件不存在（skill 已删、config 从未存在、bots.json 丢失）
- 2 条环境变量没设（CSV 有值但 env 空）
- 多条存储方式和路径标错（指向假文件、分类错误）
- 40% 的数据已与现实不一致

## 根因

人改了文件路径、删了项目、迁移了配置——表是手动维护的，不会自动更新。
时间越长腐烂越严重。同一个值散在工具架、Bitable、.env、CSV 四处，改一处漏三处。

## 修复/步骤

五步审计工作流：

```
1. 全量导出 +record-list → 按凭证存储方式分组
2. 逐类验证：
   env var → [Environment]::GetEnvironmentVariable
   .env    → ls 文件是否存在
   JSON    → cat 文件是否存在 + 字段是否匹配
   工具架   → manifest.json 是否存在 + agent_notes 是否含凭证引用
3. 标记差异：路径不存在 / env 未设 / 存储方式标错 / 服务已废弃
4. 批量修正 → 无法确认的标"未知"，不猜
5. 最终过一遍：只剩已知且合理的异常（如国内站无 API 的 CSV 登录凭据）
```

lark-cli 关键命令：
```bash
# 全量导出
lark-cli base +record-list --base-token <token> --table-id <tbl> --format json

# 批量更新
lark-cli base +record-batch-update --json '{"update_records":{"recX":{"字段":["值"]}}}'

# 删除
lark-cli base +record-delete --record-id <id> --yes
```

## 预防

- 凭证表是工具架的视图缓存，不是独立真相。每次在工具架改了凭证位置，同步更新 Bitable
- 每季度跑一次审计，或工具架新增 ≥3 个工具时触发
- 字段名自带解释 + description，审计效率高 10 倍
