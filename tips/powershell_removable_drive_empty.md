# PowerShell Get-ChildItem 在外接驱动器上静默返回空

type: pitfall
date: 2026-08-01
source: camera-import session

## 现象
PowerShell `Get-ChildItem E:\` 或 `Get-ChildItem E:\ -Recurse` 对外接 SD 卡/USB 驱动器返回空，无任何报错。第一次调用偶尔成功，后续全部静默失败。

## 根因
PowerShell PSDrive provider 在可移动介质上的缓存/挂载行为不稳定。驱动器的 Used/Free 属性可能未填充，导致 cmdlet 跳过目录枚举。

## 修复
外接驱动器文件操作走 **Git Bash**（`find /e/`、`ls /e/`），不走 PowerShell。PowerShell 仅用于本地固定磁盘。

## 预防
涉及 E:\ F:\ G:\ 等可移动盘符的文件扫描/复制/删除，首选 Bash 工具，不用 PowerShell `Get-ChildItem`。
