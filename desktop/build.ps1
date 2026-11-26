# 构建工具架托盘宿主：生成图标 -> csc 编译为单文件 exe
# 用法：pwsh -File build.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Set-Location $here

$ico = Join-Path $here 'AgentboardTray.ico'
$src = Join-Path $here 'AgentboardTray.cs'
$exe = Join-Path $here 'AgentboardTray.exe'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $csc)) { throw "找不到 csc.exe: $csc" }
if (-not (Test-Path $src)) { throw "找不到源码: $src" }

Write-Output '--- 生成图标 ---'
& (Join-Path $here 'make-icon.ps1') -OutFile $ico | Write-Output

Write-Output '--- 编译 ---'
$cscArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/codepage:65001',
    "/win32icon:$ico",
    "/out:$exe",
    '/r:System.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    $src
)
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw "编译失败，csc 退出码 $LASTEXITCODE" }

$fi = Get-Item $exe
Write-Output ("--- 完成: {0}  {1:N0} bytes  {2}" -f $fi.FullName, $fi.Length, $fi.LastWriteTime)
