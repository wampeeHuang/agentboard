# Node.js child_process 读 PowerShell stderr 中文乱码

type: capability
date: 2026-07-09
source: Inspector 面板 scheduler 运行时错误信息乱码

## 现象

Inspector 面板 scheduler 区域任务 lastError 显示 `$LASTEXITCODE : 锟睫凤拷锟斤拷�` 乱码。原始 PowerShell 错误信息 `无法将"$LASTEXITCODE"项识别为 cmdlet` 全部变为不可读字符。

## 根因

Windows 中文版 PowerShell 的 stderr 输出编码是 GBK（codepage 936），不是 UTF-8。Node.js `child_process.exec` / `execSync` 默认以 UTF-8 解码 stdout/stderr，GBK 字节被错误解码。

```
PowerShell stderr bytes (GBK):  CE DE B7 A8 BD AB ...
Node.js 按 UTF-8 解码:          → �޷�����... (乱码)
```

随后这些乱码字符被 `JSON.stringify` 写入 scheduler-state.json，Inspector 再读出时已永久损坏——无效 UTF-8 序列在写入时就被替换为 U+FFFD。

## 修复

**方案 1：读 raw buffer 再解码**（推荐）

```js
const { execSync } = require('child_process');
const buf = execSync('powershell ...', { encoding: 'buffer' });
const text = new TextDecoder('gbk').decode(buf);
```

**方案 2：强制 PowerShell 输出 UTF-8**

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
```

但某些 PowerShell 主机（如 cron/scheduler 环境）不生效。

**方案 3：事后修复**（不推荐，数据已损）

如果 UTF-8 解码时产生了 U+FFFD 替换字符，原始 GBK 字节已永久丢失。只能修复"UTF-8 字节被存储为 Latin-1 字符"这种较轻的损坏：

```js
function fixLatin1Misdecode(str) {
  if (!/[-ÿ]/.test(str)) return str;
  return Buffer.from(str, 'latin1').toString('utf8');
}
```

## 识别

- 错误信息含大量 `ï¿½` 或 `锟斤拷` 或 `�`（U+FFFD）
- 出问题的字符串以 `$LASTEXITCODE` 或 `所在位置` 等 PowerShell 特征开头
- 只在 Windows 中文版出现，英文 Windows 或 Linux 不触发

## 误判陷阱

看到 `�` 字符时容易判断为"显示问题，数据本身没问题"——这是错的。U+FFFD 意味着原始字节已在 UTF-8 解码时被替换，数据已不可恢复。预防比修复重要。
