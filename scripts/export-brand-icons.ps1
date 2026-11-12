$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$brandRoot = Join-Path $projectRoot 'assets/branding'
$inputPath = Join-Path $brandRoot 'icon-fox-v1.png'
$outputRoot = Join-Path $brandRoot 'icons'
[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
$source = [Drawing.Image]::FromFile($inputPath)
$sizes = @(16, 20, 24, 32, 48, 64, 128, 256)
$frames = [Collections.Generic.List[byte[]]]::new()
try {
    if ($source.Width -ne $source.Height) { throw 'The icon source must be square.' }
    foreach ($size in $sizes) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $stream = [IO.MemoryStream]::new()
        try {
            $graphics.Clear([Drawing.Color]::Transparent)
            $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $size, $size))
            $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
            $bytes = $stream.ToArray()
            $frames.Add($bytes)
            [IO.File]::WriteAllBytes((Join-Path $outputRoot "fox-$size.png"), $bytes)
        } finally { $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
    $iconStream = [IO.MemoryStream]::new()
    $writer = [IO.BinaryWriter]::new($iconStream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
            $offset += $frames[$index].Length
        }
        foreach ($bytes in $frames) { $writer.Write($bytes) }
        $writer.Flush()
        [IO.File]::WriteAllBytes((Join-Path $brandRoot 'icon-fox-v1.ico'), $iconStream.ToArray())
    } finally { $writer.Dispose(); $iconStream.Dispose() }
} finally { $source.Dispose() }
Write-Output 'Exported PNG sizes 16/20/24/32/48/64/128/256 and Windows ICO.'
