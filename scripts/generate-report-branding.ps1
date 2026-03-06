$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Graphics {
  param(
    [int]$Width,
    [int]$Height
  )

  $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return [PSCustomObject]@{
    Bitmap = $bmp
    Graphics = $g
  }
}

function Save-BannerImage {
  param(
    [string]$OutPath
  )

  $width = 3000
  $height = 750
  $canvas = New-Graphics -Width $width -Height $height
  $bmp = $canvas.Bitmap
  $g = $canvas.Graphics

  $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 10, 63, 95),
    [System.Drawing.Color]::FromArgb(255, 21, 142, 171),
    0.0
  )
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()

  $overlay = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(70, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(60, 5, 30, 50),
    90.0
  )
  $g.FillRectangle($overlay, $rect)
  $overlay.Dispose()

  $wave1Path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $wave1Path.StartFigure()
  $wave1Path.AddBezier(0, 470, 420, 320, 920, 630, 1520, 470)
  $wave1Path.AddBezier(1520, 470, 2060, 320, 2540, 640, 3000, 510)
  $wave1Path.AddLine(3000, 750, 0, 750)
  $wave1Path.CloseFigure()
  $wave1Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(72, 255, 255, 255))
  $g.FillPath($wave1Brush, $wave1Path)
  $wave1Brush.Dispose()
  $wave1Path.Dispose()

  $wave2Path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $wave2Path.StartFigure()
  $wave2Path.AddBezier(0, 565, 560, 420, 1220, 725, 1760, 560)
  $wave2Path.AddBezier(1760, 560, 2240, 440, 2660, 720, 3000, 600)
  $wave2Path.AddLine(3000, 750, 0, 750)
  $wave2Path.CloseFigure()
  $wave2Brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(85, 6, 41, 70))
  $g.FillPath($wave2Brush, $wave2Path)
  $wave2Brush.Dispose()
  $wave2Path.Dispose()

  for ($i = 0; $i -lt 7; $i++) {
    $r = 34 + ($i * 16)
    $x = 2210 + ($i * 95)
    $y = 120 + (($i % 2) * 58)
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(65, 255, 255, 255))
    $g.FillEllipse($dotBrush, $x, $y, $r, $r)
    $dotBrush.Dispose()
  }

  $sealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 255, 255, 255))
  $g.FillEllipse($sealBrush, 120, 120, 230, 230)
  $sealBrush.Dispose()
  $sealPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 255, 255, 255), 6)
  $g.DrawEllipse($sealPen, 120, 120, 230, 230)
  $sealPen.Dispose()

  $iconPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 255, 255, 255), 12)
  $g.DrawLine($iconPen, 200, 185, 270, 185)
  $g.DrawLine($iconPen, 214, 185, 194, 275)
  $g.DrawLine($iconPen, 257, 185, 277, 275)
  $g.DrawArc($iconPen, 192, 250, 88, 70, 8, 164)
  $iconPen.Dispose()

  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 232, 247, 255))

  $titleFont = New-Object System.Drawing.Font('Segoe UI', 112, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font('Segoe UI', 44, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $metaFont = New-Object System.Drawing.Font('Segoe UI', 33, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  $g.DrawString('YOUR LAB NAME', $titleFont, $whiteBrush, 410, 160)
  $g.DrawString('Precision Diagnostics and Reliable Results', $subFont, $softBrush, 420, 340)
  $g.DrawString('www.yourlab.com   |   +964 000 000 0000', $metaFont, $softBrush, 420, 425)

  $titleFont.Dispose()
  $subFont.Dispose()
  $metaFont.Dispose()
  $whiteBrush.Dispose()
  $softBrush.Dispose()

  $ruleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
  $g.FillRectangle($ruleBrush, 420, 505, 1400, 7)
  $ruleBrush.Dispose()

  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Save-FooterImage {
  param(
    [string]$OutPath
  )

  # Footer is rendered in a very short strip (fixed 18mm height) with object-fit: contain.
  # Use a much wider canvas so it fills the footer width in PDF output.
  $width = 9000
  $height = 750
  $scaleX = $width / 3000.0
  $canvas = New-Graphics -Width $width -Height $height
  $bmp = $canvas.Bitmap
  $g = $canvas.Graphics

  $g.Clear([System.Drawing.Color]::FromArgb(255, 248, 252, 255))

  $topBandRect = New-Object System.Drawing.Rectangle(0, 0, $width, 230)
  $topBand = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $topBandRect,
    [System.Drawing.Color]::FromArgb(255, 9, 77, 112),
    [System.Drawing.Color]::FromArgb(255, 26, 142, 171),
    0.0
  )
  $g.FillRectangle($topBand, $topBandRect)
  $topBand.Dispose()

  $curvePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $curvePath.StartFigure()
  $curvePath.AddBezier(
    0,
    160,
    [int][math]::Round(560 * $scaleX),
    290,
    [int][math]::Round(1120 * $scaleX),
    55,
    [int][math]::Round(1760 * $scaleX),
    198
  )
  $curvePath.AddBezier(
    [int][math]::Round(1760 * $scaleX),
    198,
    [int][math]::Round(2320 * $scaleX),
    320,
    [int][math]::Round(2690 * $scaleX),
    85,
    $width,
    190
  )
  $curvePath.AddLine($width, 230, 0, 230)
  $curvePath.CloseFigure()
  $curveBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(65, 255, 255, 255))
  $g.FillPath($curveBrush, $curvePath)
  $curveBrush.Dispose()
  $curvePath.Dispose()

  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 98, 137))
  $g.FillRectangle($accentBrush, 0, 230, $width, 14)
  $accentBrush.Dispose()

  $leftBadge = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 232, 246, 252))
  $leftCircleX = [int][math]::Round(120 * $scaleX)
  $leftCircleY = 278
  $leftCircleSize = 310
  $g.FillEllipse($leftBadge, $leftCircleX, $leftCircleY, $leftCircleSize, $leftCircleSize)
  $leftBadge.Dispose()
  $leftBadgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 15, 98, 137), 6)
  $g.DrawEllipse($leftBadgePen, $leftCircleX, $leftCircleY, $leftCircleSize, $leftCircleSize)
  $leftBadgePen.Dispose()

  $pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 98, 137))
  $pinCenterX = $leftCircleX + [int][math]::Round($leftCircleSize * 0.52)
  $g.FillEllipse($pinBrush, $pinCenterX - 28, 355, 56, 56)
  $g.FillRectangle($pinBrush, $pinCenterX - 9, 410, 18, 100)
  $pinBrush.Dispose()

  $textDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 56, 78))
  $textMid = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 33, 93, 126))

  $line1Font = New-Object System.Drawing.Font('Segoe UI', 170, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $line2Font = New-Object System.Drawing.Font('Segoe UI', 104, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $line3Font = New-Object System.Drawing.Font('Segoe UI', 90, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  $textX = $leftCircleX + $leftCircleSize + [int][math]::Round(115 * $scaleX)
  $g.DrawString('YOUR LAB NAME | Contact: +964 000 000 0000', $line1Font, $textDark, $textX, 272)
  $g.DrawString('www.yourlab.com  |  info@yourlab.com', $line2Font, $textMid, $textX, 456)
  $g.DrawString('Your City, Your Street, Building 00', $line3Font, $textMid, $textX, 585)

  $line1Font.Dispose()
  $line2Font.Dispose()
  $line3Font.Dispose()
  $textDark.Dispose()
  $textMid.Dispose()

  for ($i = 0; $i -lt 8; $i++) {
    $dot = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 15, 98, 137))
    $size = 42 + ($i * 11)
    $x = $width - [int][math]::Round(1100 * $scaleX) + ($i * 140)
    $y = 332 + (($i % 2) * 62)
    $g.FillEllipse($dot, $x, $y, $size, $size)
    $dot.Dispose()
  }

  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$outDir = Join-Path $PSScriptRoot '..\design-assets'
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$bannerPath = Join-Path $outDir 'report-banner-3000x750.png'
$footerPath = Join-Path $outDir 'report-footer-8250x750.png'

Save-BannerImage -OutPath $bannerPath
Save-FooterImage -OutPath $footerPath

Write-Output "Generated:"
Write-Output " - $bannerPath"
Write-Output " - $footerPath"
