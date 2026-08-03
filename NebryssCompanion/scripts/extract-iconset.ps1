param(
    [string]$SourcePath = "C:\Users\jeanh\Desktop\Nebryss Killteam Campaign\assets\icons\iconset.png",
    [string]$OutputRoot = "C:\Users\jeanh\Desktop\Nebryss Killteam Campaign\assets\icons\extracted"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Test-BackgroundCandidate {
    param(
        [System.Drawing.Color]$Color
    )

    $luma = ($Color.R + $Color.G + $Color.B) / 3.0
    $maxChannel = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
    $minChannel = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
    $spread = $maxChannel - $minChannel

    return ($luma -lt 110 -and $spread -lt 55)
}

function Remove-ConnectedBackground {
    param(
        [System.Drawing.Bitmap]$Bitmap
    )

    $width = $Bitmap.Width
    $height = $Bitmap.Height
    $visited = New-Object 'bool[]' ($width * $height)
    $queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()

    function Add-IfBackground {
        param(
            [int]$X,
            [int]$Y
        )

        if ($X -lt 0 -or $Y -lt 0 -or $X -ge $width -or $Y -ge $height) {
            return
        }

        $index = ($Y * $width) + $X
        if ($visited[$index]) {
            return
        }

        $pixel = $Bitmap.GetPixel($X, $Y)
        if (-not (Test-BackgroundCandidate -Color $pixel)) {
            return
        }

        $visited[$index] = $true
        $queue.Enqueue([System.Drawing.Point]::new($X, $Y))
    }

    for ($x = 0; $x -lt $width; $x++) {
        Add-IfBackground -X $x -Y 0
        Add-IfBackground -X $x -Y ($height - 1)
    }

    for ($y = 0; $y -lt $height; $y++) {
        Add-IfBackground -X 0 -Y $y
        Add-IfBackground -X ($width - 1) -Y $y
    }

    $neighbors = @(
        [System.Drawing.Point]::new(-1, 0),
        [System.Drawing.Point]::new(1, 0),
        [System.Drawing.Point]::new(0, -1),
        [System.Drawing.Point]::new(0, 1),
        [System.Drawing.Point]::new(-1, -1),
        [System.Drawing.Point]::new(1, -1),
        [System.Drawing.Point]::new(-1, 1),
        [System.Drawing.Point]::new(1, 1)
    )

    while ($queue.Count -gt 0) {
        $point = $queue.Dequeue()
        foreach ($offset in $neighbors) {
            Add-IfBackground -X ($point.X + $offset.X) -Y ($point.Y + $offset.Y)
        }
    }

    $output = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    for ($y = 0; $y -lt $height; $y++) {
        for ($x = 0; $x -lt $width; $x++) {
            $index = ($y * $width) + $x
            if ($visited[$index]) {
                $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            } else {
                $output.SetPixel($x, $y, $Bitmap.GetPixel($x, $y))
            }
        }
    }

    return $output
}

function Trim-TransparentBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap
    )

    $minX = $Bitmap.Width
    $minY = $Bitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt 0) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -lt 0 -or $maxY -lt 0) {
        return [System.Drawing.Bitmap]::new(1, 1, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    }

    $padding = 2
    $cropX = [Math]::Max(0, $minX - $padding)
    $cropY = [Math]::Max(0, $minY - $padding)
    $cropWidth = [Math]::Min($Bitmap.Width - $cropX, ($maxX - $minX + 1) + ($padding * 2))
    $cropHeight = [Math]::Min($Bitmap.Height - $cropY, ($maxY - $minY + 1) + ($padding * 2))
    $rect = [System.Drawing.Rectangle]::new($cropX, $cropY, $cropWidth, $cropHeight)

    $trimmed = [System.Drawing.Bitmap]::new($rect.Width, $rect.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($trimmed)
    $graphics.DrawImage($Bitmap, 0, 0, $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()

    return $trimmed
}

function Export-Icon {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [System.Drawing.Rectangle]$Rect,
        [string]$OutputPath
    )

    $cropped = [System.Drawing.Bitmap]::new($Rect.Width, $Rect.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($cropped)
    $graphics.DrawImage($SourceBitmap, 0, 0, $Rect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()

    $transparent = Remove-ConnectedBackground -Bitmap $cropped
    $trimmed = Trim-TransparentBounds -Bitmap $transparent

    $parent = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $trimmed.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $cropped.Dispose()
    $transparent.Dispose()
    $trimmed.Dispose()
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Source image not found: $SourcePath"
}

if (-not (Test-Path -LiteralPath $OutputRoot)) {
    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}

$sizes = @("small", "medium", "big", "immense")
$stripX = @(0, 341, 681)
$rowY = @(13, 107, 198, 289, 381, 472)
$slotRects = @(
    @{ X = 20; Width = 52 },
    @{ X = 90; Width = 70 },
    @{ X = 173; Width = 72 },
    @{ X = 255; Width = 74 }
)
$iconYOffset = 16
$iconHeight = 50

$familySets = @(
    @{ Family = "city"; Strip = 0; Row = 0; Variant = 1 },
    @{ Family = "wasteland"; Strip = 0; Row = 1; Variant = 1 },
    @{ Family = "fortress"; Strip = 0; Row = 2; Variant = 1 },
    @{ Family = "shrine"; Strip = 0; Row = 3; Variant = 1 },
    @{ Family = "industrial-zone"; Strip = 0; Row = 4; Variant = 1 },
    @{ Family = "mystical-site"; Strip = 0; Row = 5; Variant = 1 },
    @{ Family = "harbor"; Strip = 1; Row = 0; Variant = 1 },
    @{ Family = "wasteland"; Strip = 1; Row = 1; Variant = 2 },
    @{ Family = "fortress"; Strip = 1; Row = 2; Variant = 2 },
    @{ Family = "mountain"; Strip = 1; Row = 3; Variant = 1 },
    @{ Family = "swamp"; Strip = 1; Row = 4; Variant = 1 },
    @{ Family = "mystical-site"; Strip = 1; Row = 5; Variant = 2 },
    @{ Family = "fortress"; Strip = 2; Row = 0; Variant = 3 },
    @{ Family = "forest"; Strip = 2; Row = 1; Variant = 1 },
    @{ Family = "ruins"; Strip = 2; Row = 2; Variant = 1 },
    @{ Family = "village"; Strip = 2; Row = 3; Variant = 1 },
    @{ Family = "volcanic-area"; Strip = 2; Row = 4; Variant = 1 },
    @{ Family = "mystical-site"; Strip = 2; Row = 5; Variant = 3 }
)

$familyCounts = @{}
foreach ($set in $familySets) {
    if ($familyCounts.ContainsKey($set.Family)) {
        $familyCounts[$set.Family]++
    } else {
        $familyCounts[$set.Family] = 1
    }
}

$sheet = [System.Drawing.Bitmap]::FromFile($SourcePath)

try {
    foreach ($set in $familySets) {
        $stripLeft = $stripX[$set.Strip]
        $rowTop = $rowY[$set.Row]

        if ($familyCounts[$set.Family] -gt 1) {
            $folder = Join-Path (Join-Path $OutputRoot $set.Family) ("variant-" + $set.Variant)
        } else {
            $folder = Join-Path $OutputRoot $set.Family
        }

        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $slot = $slotRects[$i]
            $rect = [System.Drawing.Rectangle]::new(
                $stripLeft + $slot.X,
                $rowTop + $iconYOffset,
                $slot.Width,
                $iconHeight
            )
            $fileName = "{0}-{1}.png" -f $set.Family, $sizes[$i]
            $outputPath = Join-Path $folder $fileName
            Export-Icon -SourceBitmap $sheet -Rect $rect -OutputPath $outputPath
        }
    }
}
finally {
    $sheet.Dispose()
}

$summary = [PSCustomObject]@{
    OutputRoot = $OutputRoot
    Families = @(
        foreach ($familyName in ($familyCounts.Keys | Sort-Object)) {
            if ($familyCounts[$familyName] -gt 1) {
                "{0} ({1} variants)" -f $familyName, $familyCounts[$familyName]
            } else {
                $familyName
            }
        }
    )
    IconFiles = ($familySets.Count * $sizes.Count)
}

$summary | ConvertTo-Json -Depth 4
