# =============================================================================
# Asphyxia Custom Charts Sync Script
# Place this script next to your game executable (or anywhere you like).
# Edit the settings below, then run this instead of launching the game directly.
#
# This version does a differential sync:
#   - Downloads only charts that are missing or have been re-converted.
#   - Deletes local charts that the server has removed.
#   - Refreshes music_db.merged.xml on every sync.
# Per-chart zips live on Google Drive (configured in the plugin settings),
# so downloads come straight from Google's CDN rather than the Asphyxia server.
# =============================================================================

# --- SETTINGS (edit these) ---------------------------------------------------
$ServerUrl    = "http://localhost:8083"   # Asphyxia server URL
$GameRoot     = ""                        # Leave empty to auto-detect from script location
$GameExe      = "spice64.exe"             # Game launcher executable name
$GameArgs     = ""                        # Arguments to pass to the game
# -----------------------------------------------------------------------------

if (-not $GameRoot) {
    $GameRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Asphyxia Custom Charts Sync" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server:    $ServerUrl"
Write-Host "Game Root: $GameRoot"
Write-Host ""

function Start-Game {
    $exePath = Join-Path $GameRoot $GameExe
    if (Test-Path $exePath) {
        Write-Host ""
        Write-Host "Starting game..." -ForegroundColor Cyan
        if ($GameArgs) { Start-Process -FilePath $exePath -ArgumentList $GameArgs -WorkingDirectory $GameRoot }
        else { Start-Process -FilePath $exePath -WorkingDirectory $GameRoot }
    } else {
        Write-Host "Game executable not found: $exePath" -ForegroundColor Red
        Write-Host "Edit the `$GameExe variable in this script to match your launcher."
    }
}

# Step 1: Fetch manifest from server
Write-Host "Fetching chart manifest..." -NoNewline
try {
    $manifest = Invoke-RestMethod -Uri "$ServerUrl/api/nautica/manifest" -TimeoutSec 10
} catch {
    Write-Host " FAILED (server unreachable)" -ForegroundColor Yellow
    Write-Host "Starting game without sync..."
    Start-Game
    exit
}
Write-Host " OK" -ForegroundColor Green

$mixName = if ($manifest.mixName) { $manifest.mixName } else { "asphyxia_custom" }
$serverCharts = @($manifest.charts)

$customDir = Join-Path $GameRoot "data_mods\$mixName"
$musicDir  = Join-Path $customDir "music"
$thumbDir  = Join-Path $customDir "graphics\s_jacket00_ifs"
$xmlDir    = Join-Path $customDir "others"
$stateFile = Join-Path $customDir ".asphyxia_sync_state.json"

# Ensure dirs exist (so a clean machine still works)
foreach ($d in @($customDir, $musicDir, $thumbDir, $xmlDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# Step 2: Scan local installed charts
$installedMids = @{}
if (Test-Path $musicDir) {
    Get-ChildItem -Path $musicDir -Directory | ForEach-Object {
        if ($_.Name -match '^(\d+)_') {
            $installedMids[[int]$matches[1]] = $_.Name
        }
    }
}

# Step 3: Load sync state (convertedAt per mid); initialize on first run
$localState = @{}
if (Test-Path $stateFile) {
    try {
        $raw = Get-Content $stateFile -Raw | ConvertFrom-Json
        foreach ($prop in $raw.PSObject.Properties) {
            $localState[[int]$prop.Name] = [long]$prop.Value
        }
    } catch {
        Write-Host "  (state file corrupt, rebuilding)" -ForegroundColor Yellow
    }
}

# For any installed chart missing from state, mark it as up-to-date at the server's current convertedAt
# so we don't force-redownload on first run after migrating from the old sync script.
foreach ($mid in $installedMids.Keys) {
    if (-not $localState.ContainsKey([int]$mid)) {
        $serverEntry = $serverCharts | Where-Object { [int]$_.mid -eq [int]$mid } | Select-Object -First 1
        if ($serverEntry) {
            $localState[[int]$mid] = [long]$serverEntry.convertedAt
        } else {
            $localState[[int]$mid] = 0
        }
    }
}

# Step 4: Diff
$serverMidSet = @{}
foreach ($c in $serverCharts) { $serverMidSet[[int]$c.mid] = $true }

$toDownload = @()
foreach ($c in $serverCharts) {
    $mid = [int]$c.mid
    $serverConv = [long]$c.convertedAt
    $localConv  = if ($localState.ContainsKey($mid)) { [long]$localState[$mid] } else { 0 }
    $needsFetch = (-not $installedMids.ContainsKey($mid)) -or ($serverConv -gt $localConv)
    if ($needsFetch) {
        if ($c.downloadUrl) {
            $toDownload += $c
        } else {
            Write-Host ("  Skipping {0} (ID {1}) \u2014 server has not uploaded it to Drive yet" -f $c.title, $mid) -ForegroundColor DarkYellow
        }
    }
}

$toDelete = @()
foreach ($mid in $installedMids.Keys) {
    if (-not $serverMidSet.ContainsKey([int]$mid)) {
        $toDelete += [int]$mid
    }
}

$anyWork = ($toDownload.Count -gt 0) -or ($toDelete.Count -gt 0)

if (-not $anyWork) {
    Write-Host "Already up to date (checking merged XML anyway)." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host ("Plan: {0} new/updated, {1} to delete" -f $toDownload.Count, $toDelete.Count) -ForegroundColor Cyan

    # Step 5: Delete removed charts
    foreach ($mid in $toDelete) {
        $idStr = "{0:D4}" -f $mid
        Write-Host ("  Deleting {0}..." -f $installedMids[$mid])
        $songFolder = Join-Path $musicDir $installedMids[$mid]
        if (Test-Path $songFolder) { Remove-Item -Path $songFolder -Recurse -Force }
        if (Test-Path $thumbDir) {
            Get-ChildItem -Path $thumbDir -Filter ("jk_{0}_*" -f $idStr) | ForEach-Object {
                Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
        $localState.Remove([int]$mid) | Out-Null
    }

    # Step 6: Download new/updated charts (parallel on PS7+, serial fallback on PS5)
    $ProgressPreference = 'SilentlyContinue'

    # Pre-clean old folders sequentially (avoid race conditions between parallel workers)
    foreach ($c in $toDownload) {
        $mid = [int]$c.mid
        $idStr = "{0:D4}" -f $mid
        if ($installedMids.ContainsKey($mid)) {
            $oldFolder = Join-Path $musicDir $installedMids[$mid]
            if (Test-Path $oldFolder) { Remove-Item -Path $oldFolder -Recurse -Force }
            if (Test-Path $thumbDir) {
                Get-ChildItem -Path $thumbDir -Filter ("jk_{0}_*" -f $idStr) | ForEach-Object {
                    Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }

    $useParallel = $PSVersionTable.PSVersion.Major -ge 7
    $ok = 0
    $failed = 0

    # Drive download helper. For small files, Drive streams the zip from the
    # /uc?export=download URL directly. For files past its "large" threshold
    # (~25 MB), Drive returns an HTML "scan for viruses" interstitial instead;
    # the interstitial contains a <form> whose action is a different host
    # (drive.usercontent.google.com) plus confirm= and uuid= tokens that have
    # to be echoed back. This helper runs the download and, if the response
    # turns out to be HTML rather than a zip, parses the interstitial, follows
    # the form URL, and writes the zip.
    #
    # Uses a shared WebSession across both requests so cookies Drive sets on
    # the initial response survive into the follow-up — without that, Drive
    # re-serves the interstitial instead of the zip.
    $driveDownloader = {
        param($url, $zipPath)

        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $zipPath -TimeoutSec 300 -UseBasicParsing -SessionVariable driveSession

        $bytes = [System.IO.File]::ReadAllBytes($zipPath) | Select-Object -First 2
        if ($bytes.Count -ge 2 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B) {
            return  # ZIP signature PK; we're done.
        }

        # Interstitial path. Read what we got (tiny HTML) and extract the
        # confirm form action + the uuid + (if present) a different id.
        $html = Get-Content -Path $zipPath -Raw -ErrorAction Stop

        # Pick the <form> whose action points at drive.usercontent.google.com
        # /download, NOT the first action="..." on the page — Drive's shell
        # layout contains unrelated forms (search, account UI, etc.) whose
        # action attributes match earlier and yield a relative path like
        # "/something" that fails URI parsing downstream with "Ungültiger URI:
        # Der Hostname konnte nicht analysiert werden".
        $formAction = ''
        $actionMatches = [regex]::Matches($html, 'action="([^"]+)"')
        foreach ($m in $actionMatches) {
            $candidate = $m.Groups[1].Value
            if ($candidate -match 'drive\.usercontent\.google\.com|drive\.google\.com.*download') {
                $formAction = $candidate
                break
            }
        }
        if (-not $formAction) {
            $formAction = 'https://drive.usercontent.google.com/download'
        }

        # Decode HTML entities Drive emits inside attribute values. &amp;
        # inside the action URL turns it into an invalid URI once you try
        # to append a second query string.
        $formAction = [System.Net.WebUtility]::HtmlDecode($formAction)

        # Tolerate both attribute orderings and various whitespace.
        $extract = {
            param($field, $html)
            $p1 = 'name="{0}"\s+value="([^"]+)"' -f [regex]::Escape($field)
            $p2 = 'value="([^"]+)"\s+name="{0}"' -f [regex]::Escape($field)
            $m = [regex]::Match($html, $p1)
            if ($m.Success) { return $m.Groups[1].Value }
            $m = [regex]::Match($html, $p2)
            if ($m.Success) { return $m.Groups[1].Value }
            return ''
        }
        $uuid    = & $extract 'uuid'    $html
        $confirm = & $extract 'confirm' $html
        $formId  = & $extract 'id'      $html

        if (-not $uuid -and -not $confirm) {
            $dumpPath = $zipPath -replace '\.zip$', '.interstitial.html'
            try { Move-Item -Path $zipPath -Destination $dumpPath -Force -ErrorAction SilentlyContinue } catch {}
            throw "Drive returned HTML but no confirm/uuid form fields (quota exhausted, permission change, or new interstitial format). Raw HTML saved to $dumpPath"
        }

        # Some interstitials omit id= in the form; fall back to the original URL's id.
        if (-not $formId) {
            $origId = [regex]::Match($url, '[?&]id=([^&]+)').Groups[1].Value
            if ($origId) { $formId = $origId }
        }

        $qs = @()
        if ($formId)  { $qs += "id=$formId" }
        if ($confirm) { $qs += "confirm=$confirm" }
        if ($uuid)    { $qs += "uuid=$uuid" }
        $qs += 'export=download'
        # Concat, not string-interpolate: PowerShell 7 can swallow "$var?"
        # (the "?" triggers null-conditional tokenization mid-expansion) and
        # drop the action prefix, producing "id=...&export=download" with
        # no scheme — which then fails .NET URI parsing.
        $joined = [string]::Join('&', $qs)
        $followUrl = $formAction + '?' + $joined

        try { [void][System.Uri]::new($followUrl) } catch {
            throw "Constructed follow-up URL is not a valid URI: '$followUrl' (originalAction='$formAction'). Parse error: $($_.Exception.Message)"
        }

        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Invoke-WebRequest -Uri $followUrl -OutFile $zipPath -TimeoutSec 600 -UseBasicParsing -WebSession $driveSession

        $bytes = [System.IO.File]::ReadAllBytes($zipPath) | Select-Object -First 2
        if (-not ($bytes.Count -ge 2 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B)) {
            throw "Follow-up request to Drive still did not return a zip (session cookies may have expired or Drive served a second interstitial)"
        }
    }

    if ($useParallel) {
        # PowerShell 7+: ForEach-Object -Parallel with a concurrency cap. Keep it
        # modest — Drive throttles aggressive concurrent requests to a single
        # account, and the 4-wide pool keeps network saturated without tripping
        # rate limits.
        $driveDownloaderStr = $driveDownloader.ToString()
        $results = $toDownload | ForEach-Object -ThrottleLimit 4 -Parallel {
            $c = $_
            $mid = [int]$c.mid
            $idStr = "{0:D4}" -f $mid
            $zipPath = Join-Path $env:TEMP ("asphyxia_chart_{0}.zip" -f $idStr)
            $url = $c.downloadUrl
            # Drop any stale &confirm=t — the helper adds it itself only after
            # parsing the interstitial, and appending it unconditionally to the
            # /uc?export=download URL does nothing useful.
            $url = $url -replace '&confirm=t', ''

            try {
                $dl = [scriptblock]::Create($using:driveDownloaderStr)
                & $dl $url $zipPath
                return [pscustomobject]@{ mid=$mid; idStr=$idStr; title=$c.title; convertedAt=$c.convertedAt; zipPath=$zipPath; error=$null }
            } catch {
                if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue }
                return [pscustomobject]@{ mid=$mid; idStr=$idStr; title=$c.title; convertedAt=$c.convertedAt; zipPath=$null; error=$_.Exception.Message }
            }
        }

        # Extract serially — Expand-Archive into the same customDir is not safe concurrently
        foreach ($r in $results) {
            Write-Host ("  [{0}] {1}..." -f $r.idStr, $r.title) -NoNewline
            if ($r.error) {
                $failed++
                Write-Host (" FAILED: {0}" -f $r.error) -ForegroundColor Red
                continue
            }
            try {
                Expand-Archive -Path $r.zipPath -DestinationPath $customDir -Force
                Remove-Item -Path $r.zipPath -Force -ErrorAction SilentlyContinue
                $localState[[int]$r.mid] = [long]$r.convertedAt
                $ok++
                Write-Host " OK" -ForegroundColor Green
            } catch {
                $failed++
                Write-Host (" FAILED (extract): {0}" -f $_.Exception.Message) -ForegroundColor Red
                if (Test-Path $r.zipPath) { Remove-Item -Path $r.zipPath -Force -ErrorAction SilentlyContinue }
            }
        }
    } else {
        # PowerShell 5 fallback: serial downloads.
        foreach ($c in $toDownload) {
            $mid = [int]$c.mid
            $idStr = "{0:D4}" -f $mid
            Write-Host ("  Downloading [{0}] {1}..." -f $idStr, $c.title) -NoNewline

            $zipPath = Join-Path $env:TEMP ("asphyxia_chart_{0}.zip" -f $idStr)
            $url = $c.downloadUrl -replace '&confirm=t', ''

            try {
                & $driveDownloader $url $zipPath
                Expand-Archive -Path $zipPath -DestinationPath $customDir -Force
                Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
                $localState[$mid] = [long]$c.convertedAt
                $ok++
                Write-Host " OK" -ForegroundColor Green
            } catch {
                $failed++
                Write-Host (" FAILED: {0}" -f $_.Exception.Message) -ForegroundColor Red
                if (Test-Path $zipPath) { Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue }
            }
        }
    }
    $ProgressPreference = 'Continue'
}

# Steps 7+ run unconditionally. The merged XML and LayeredFS cache must be
# refreshed even when nothing was downloaded — otherwise a fresh box whose
# charts are already synced never gets the XML written (symptom: "Already
# up to date" followed by no music_db.merged.xml on disk).

# Step 7: Refresh merged XML (reflects the current server-side set of charts)
#
# WebClient.DownloadData returns the response body as raw byte[] with no
# text decoding. Critical because:
#
#   1. The XML is Shift-JIS and SDVX's prop parser requires exact bytes.
#      Invoke-WebRequest auto-decodes the body to a string using the
#      response's charset (or ISO-8859-1 when none is declared). Round-
#      tripping that string back to bytes re-encoded as UTF-8, doubling
#      every 0x80+ byte (0x83 → 0xC2 0x83). Japanese then parsed as
#      garbage and the game showed blank profile / no songs.
#
#   2. Invoke-WebRequest -OutFile also opens the destination for write
#      while the server is still reading the same file via res.sendFile,
#      tripping "Datei wird von einem anderen Prozess verwendet" when
#      sync runs on the same machine as asphyxia-core. Buffering to
#      memory first sequences the two file operations — the server's
#      read handle is closed by the time we open the destination.
try {
    $xmlUrl = "$ServerUrl/api/nautica/music-db-xml"
    $xmlPath = Join-Path $xmlDir "music_db.merged.xml"
    $client = [System.Net.WebClient]::new()
    try {
        $bytes = $client.DownloadData($xmlUrl)
    } finally {
        $client.Dispose()
    }
    [System.IO.File]::WriteAllBytes($xmlPath, $bytes)
    Write-Host ("  Refreshed music_db.merged.xml ({0} bytes)" -f $bytes.Length) -ForegroundColor Green
} catch {
    $reason = $_.Exception.Message
    $status = $null
    try { $status = $_.Exception.Response.StatusCode.value__ } catch {}
    Write-Host ("  Could not refresh music_db.merged.xml from {0}: {1}{2}" -f `
        $xmlUrl, $reason, $(if ($status) { " (HTTP $status)" } else { "" })) -ForegroundColor Yellow
    Write-Host "  (game may still work if the existing one is close enough)" -ForegroundColor DarkYellow
}

# Step 7b: Nuke LayeredFS merge cache. Normally LayeredFS notices the
# source XML changed via its .hashed file and rebuilds on next launch,
# but we've observed stale caches persisting in edge cases. Deleting
# the cache dir forces a clean re-merge with the new content.
$cacheDir = Join-Path (Split-Path $customDir -Parent) "_cache"
if (Test-Path $cacheDir) {
    try {
        Remove-Item -Path $cacheDir -Recurse -Force -ErrorAction Stop
        Write-Host "  Cleared LayeredFS cache" -ForegroundColor Green
    } catch {
        Write-Host ("  Could not clear LayeredFS cache: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    }
}

# Step 8: Persist state
$stateObj = @{}
foreach ($k in $localState.Keys) { $stateObj["$k"] = $localState[$k] }
$stateObj | ConvertTo-Json -Depth 2 | Set-Content -Path $stateFile -Encoding UTF8

if ($anyWork) {
    Write-Host ""
    Write-Host ("Sync done: {0} downloaded, {1} deleted, {2} failed" -f $ok, $toDelete.Count, $failed) -ForegroundColor Cyan
}

Start-Game
