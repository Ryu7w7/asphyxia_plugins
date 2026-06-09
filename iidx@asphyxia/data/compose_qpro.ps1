param(
    [string]$assetDir,
    [string]$head,
    [string]$hair,
    [string]$face,
    [string]$body,
    [string]$hand,
    [string]$outFile
)

Add-Type -AssemblyName System.Drawing

$width = 340
$height = 400
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

function Draw-Part {
    param([string]$path, [int]$x, [int]$y)
    if (Test-Path $path) {
        try {
            $img = [System.Drawing.Image]::FromFile($path)
            $g.DrawImage($img, $x, $y, $img.Width, $img.Height)
            $img.Dispose()
        } catch {
            Write-Host "Failed to draw $path"
        }
    }
}

# The z-index order from pug (lowest to highest):
# z=1: hair_b
Draw-Part "$assetDir\hair\$hair\qp_hair_b.png" 44 20

# z=2: leg_r_upper, leg_r_lower, arm_r_upper, arm_r_lower, hand_r
Draw-Part "$assetDir\body\$body\qp_leg_r_upper.png" 90 245
Draw-Part "$assetDir\body\$body\qp_leg_r_lower.png" 90 245
Draw-Part "$assetDir\body\$body\qp_arm_r_upper.png" 42 178
Draw-Part "$assetDir\body\$body\qp_arm_r_lower.png" 42 178
Draw-Part "$assetDir\hand\$hand\qp_hand_r.png" 8 20

# z=3: leg_l_upper, leg_l_lower
Draw-Part "$assetDir\body\$body\qp_leg_l_upper.png" 145 245
Draw-Part "$assetDir\body\$body\qp_leg_l_lower.png" 145 245

# z=4: body_b
Draw-Part "$assetDir\body\$body\qp_body_b.png" 50 20

# z=5: body_f
Draw-Part "$assetDir\body\$body\qp_body_f.png" 50 20

# z=6: head_b
Draw-Part "$assetDir\head\$head\qp_head_b.png" 50 20

# z=7: face
Draw-Part "$assetDir\face\$face\qp_face.png" 100 60

# z=8: head_f
Draw-Part "$assetDir\head\$head\qp_head_f.png" 50 20

# z=9: hair_f
Draw-Part "$assetDir\hair\$hair\qp_hair_f.png" 44 20

# z=10: arm_l_upper, arm_l_lower
Draw-Part "$assetDir\body\$body\qp_arm_l_upper.png" 170 178
Draw-Part "$assetDir\body\$body\qp_arm_l_lower.png" 170 178

# z=11: hand_l
Draw-Part "$assetDir\hand\$hand\qp_hand_l.png" 144 20

$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
