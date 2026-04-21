$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$outDir = "g:\Mi unidad\SEMAFORO_HUMOR_SOCIAL_PARACEL\app\assets\icons"

function New-IconPng {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#103832"))

  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $brushBase = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.ColorTranslator]::FromHtml("#1b5b50"),
    [System.Drawing.ColorTranslator]::FromHtml("#103832"),
    45
  )
  $graphics.FillRectangle($brushBase, $rect)

  $sunBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#f3ba57"))
  $sunSize = [int]($Size * 0.28)
  $sunX = [int](($Size - $sunSize) / 2)
  $sunY = [int]($Size * 0.22)
  $graphics.FillEllipse($sunBrush, $sunX, $sunY, $sunSize, $sunSize)

  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#e9f5f1"), [float]($Size * 0.06))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $curvePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $curvePath.AddArc([int]($Size * 0.27), [int]($Size * 0.52), [int]($Size * 0.46), [int]($Size * 0.34), 200, 140)
  $graphics.DrawPath($pen, $curvePath)

  $fontSize = [float]($Size * 0.1)
  $font = New-Object System.Drawing.Font("Trebuchet MS", $fontSize, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#e9f5f1"))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("PARACEL", $font, $textBrush, [float]($Size / 2), [float]($Size * 0.8), $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $format.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  $curvePath.Dispose()
  $pen.Dispose()
  $sunBrush.Dispose()
  $brushBase.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-IconPng -Size 192 -Path (Join-Path $outDir "icon-192.png")
New-IconPng -Size 512 -Path (Join-Path $outDir "icon-512.png")

Write-Output "OK: iconos PNG generados"
