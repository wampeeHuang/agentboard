# Agent/脚本边界：机械操作脚本化，不给agent自由裁量

type: principle
date: 2026-07-07
source: 飞书乱码三次复发根因分析 — 宪法修订

## 边界定义

| 归脚本（固定） | 归agent（发挥） |
|-------------|-------------|
| API调用（token/curl/参数） | 搜索策略 |
| 编码处理（UTF-8/GBK/BOM） | 内容判断 |
| 凭证传递 | 匹配逻辑 |
| 文件格式（JSON结构/字段） | 语义理解 |
| HTTP错误处理 | 优先级排序 |

**判断标准**: 这个操作需要语义理解吗？不需要 → 脚本固化。需要 → agent。

## 为什么

飞书消息乱码修了三次：PowerShell GBK → echo|python管道 → 每次只堵一个向量，agent换条路又被绊倒。根因不是编码，是**把机械操作交给agent自由裁量**。

编码问题只是其中一种死法。同样会炸的还有：JSON转义错误、curl超时无重试、飞书error code误判为成功、凭证拼错……

## 实施

- cron job prompt 里禁止教 agent "怎么调API"——给脚本，给固定命令
- 新 job 上线前自检：prompt里有没有让 agent "自己想办法" 调外部 API？有 → 先写脚本
- 脚本放项目 `_runtime/` 目录，语言不限（Python/Bash/PowerShell），唯一要求：**每条IO路径显式 UTF-8**

## 反例（禁止）

```
## 发送飞书通知
步骤：
1. 调 tenant_access_token 接口...
2. 用 token 调消息接口...
飞书凭证：App ID: xxx, App Secret: xxx
```

## 正例（要求）

```
## 发送飞书通知
写卡片JSON到 _runtime/feishu_card.json
执行: python _runtime/send_feishu_card.py _runtime/feishu_card.json
```
