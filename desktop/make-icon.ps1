# 从 web/logo.svg 的几何规格生成多尺寸 Windows 图标（绿底四方块）
# 输出：同目录 AgentboardTray.ico（BMP 格式 ICO，兼容 .NET Icon / 资源管理器 / 托盘）
param(
    [string]$OutFile = (Join-Path $PSScriptRoot 'AgentboardTray.ico'),
    [int[]]$Sizes = @(16, 24, 32, 48, 64, 128, 256)
)

Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
    param($X, $Y, $W, $H, $R)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Max(1.0, $R * 2)
    if ($d -gt $W) { $d = $W }
    if ($d -gt $H) { $d = $H }
    $p.AddArc([single]($X), [single]($Y), [single]$d, [single]$d, 180, 90)
    $p.AddArc([single]($X + $W - $d), [single]($Y), [single]$d, [single]$d, 270, 90)
    $p.AddArc([single]($X + $W - $d), [single]($Y + $H - $d), [single]$d, [single]$d, 0, 90)
    $p.AddArc([single]($X), [single]($Y + $H - $d), [single]$d, [single]$d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-LogoBitmap {
    param([int]$Size)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $k = $Size / 32.0

    $green = [System.Drawing.Color]::FromArgb(255, 0x74, 0xA6, 0x3F)
    $bgBrush = New-Object System.Drawing.SolidBrush($green)
    $bgPath = New-RoundedPath 0 0 $Size $Size (5 * $k)
    $g.FillPath($bgBrush, $bgPath)

    $white = [System.Drawing.Color]::FromArgb(255, 0xF9, 0xFB, 0xF9)
    $cells = @(
        @{ X = 4; Y = 4; A = 0.9 },
        @{ X = 18; Y = 4; A = 0.9 },
        @{ X = 4; Y = 18; A = 0.55 },
        @{ X = 18; Y = 18; A = 0.55 }
    )
    foreach ($c in $cells) {
        $alpha = [int](255 * $c.A)
        $col = [System.Drawing.Color]::FromArgb($alpha, $white)
        $br = New-Object System.Drawing.SolidBrush($col)
        $path = New-RoundedPath ($c.X * $k) ($c.Y * $k) (10 * $k) (10 * $k) (2 * $k)
        $g.FillPath($br, $path)
        $br.Dispose(); $path.Dispose()
    }

    $bgBrush.Dispose(); $bgPath.Dispose()
    $g.Dispose()
    return $bmp
}

function Get-IconImageBytes {
    param([System.Drawing.Bitmap]$Bmp)
    $w = $Bmp.Width; $h = $Bmp.Height
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # BITMAPINFOHEADER
    $bw.Write([UInt32]40)          # biSize
    $bw.Write([Int32]$w)           # biWidth
    $bw.Write([Int32]($h * 2))     # biHeight (XOR + AND)
    $bw.Write([UInt16]1)           # biPlanes
    $bw.Write([UInt16]32)          # biBitCount
    $bw.Write([UInt32]0)           # biCompression = BI_RGB
    $bw.Write([UInt32]0)           # biSizeImage
    $bw.Write([Int32]0); $bw.Write([Int32]0)
    $bw.Write([UInt32]0); $bw.Write([UInt32]0)

    # XOR 位图：bottom-up BGRA
    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            $c = $Bmp.GetPixel($x, $y)
            $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
        }
    }

    # AND 掩码：每行按 4 字节对齐，全 0（透明度交给 alpha 通道）
    $rowBytes = [int]([Math]::Floor(($w + 31) / 32) * 4)
    $mask = New-Object byte[] ($rowBytes * $h)
    $bw.Write($mask)

    $bw.Flush()
    $bytes = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    return , $bytes
}

$images = @()
foreach ($s in $Sizes) {
    $bmp = New-LogoBitmap -Size $s
    $bytes = Get-IconImageBytes -Bmp $bmp
    $images += , @{ Size = $s; Bytes = $bytes }
    $bmp.Dispose()
}

$fs = New-Object System.IO.FileStream($OutFile, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)                  # reserved
$bw.Write([UInt16]1)                  # type = icon
$bw.Write([UInt16]$images.Count)
$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
    $s = $img.Size
    $dim = 0
    if ($s -lt 256) { $dim = $s }
    $bw.Write([byte]$dim)
    $bw.Write([byte]$dim)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$img.Bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $img.Bytes.Length
}
foreach ($img in $images) { $bw.Write($img.Bytes) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()

$fi = Get-Item $OutFile
Write-Output ("icon written: {0}  {1} bytes  sizes={2}" -f $fi.FullName, $fi.Length, ($Sizes -join ','))
