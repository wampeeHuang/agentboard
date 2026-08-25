---
type: method
date: 2026-08-25
source: agentboard _runtime 清理——无头截图目录沉积完整浏览器 profile
---

# 无头 Chrome 截图目录沉积完整浏览器 profile，含隐私文件

## 现象

清理工具架运行产物目录 `_runtime/` 时发现 4 个无头截图调试目录（hc-shot / hc-shot2 / hc-test / hc3）里各沉积一整套 Chrome 用户数据目录：Cookies、Login Data、History、Cache 等几十 MB。初数只数到 3 个，用 `find` 全量枚举才暴露第 4 个（hc-shot2）。

## 根因

无头 Chrome 启动截图时没显式指定 `--user-data-dir`，每次都用默认 profile 目录。任务结束时只回收了截图产物，profile 目录（浏览器持久写入的磁盘状态）一直留着，日积月累成完整浏览器用户目录——含用户浏览器会话的隐私文件。

## 修复/步骤

截图类任务，spawn Chrome 时必须显式隔离 profile：

```bash
chrome --headless --user-data-dir=/tmp/hc-profile-$$ --screenshot ...
```

任务结束连带 profile 目录一起删。批量清残留：

```bash
find <dir> -type f -delete
find <dir> -depth -type d -empty -delete
```

## 预防

- 任何 spawn 临时进程，尤其是会持久写磁盘状态的浏览器类，必须显式指定临时 `--user-data-dir`，结束即删
- 清理目录用 `find` 全量枚举清单，不靠目测/记忆——这次靠 find 才发现漏掉的第 4 个 profile
- 顺带暴露的问题：工具架截图/浏览器调试命令若复用默认 profile，等于把用户真实浏览器数据写进运行产物目录，属隐私泄漏类坑
