# scripts/setup_python.ps1
# Downloads Python embeddable + installs Pillow, pillow-heif, piexif into public/python/
# Run once before building: powershell -ExecutionPolicy Bypass -File scripts/setup_python.ps1

$ErrorActionPreference = "Stop"

$PY_VERSION  = "3.11.9"
$PY_URL      = "https://www.python.org/ftp/python/$PY_VERSION/python-$PY_VERSION-embed-amd64.zip"
$PIP_URL     = "https://bootstrap.pypa.io/get-pip.py"
$DEST        = "public\python"
$PY_EXE      = "$DEST\python.exe"

Write-Host ""
Write-Host "=========================================="
Write-Host "  DatasetForge — Bundled Python Setup"
Write-Host "=========================================="
Write-Host ""

if (Test-Path "$PY_EXE") {
    Write-Host "[INFO] Bundled Python already exists at $PY_EXE"
    Write-Host "       Delete public\python\ and re-run to refresh."
    exit 0
}

New-Item -ItemType Directory -Force -Path $DEST | Out-Null

# 1. Download Python embeddable zip
Write-Host "[1/4] Downloading Python $PY_VERSION embeddable..."
$zipPath = "$DEST\python-embed.zip"
Invoke-WebRequest -Uri $PY_URL -OutFile $zipPath -UseBasicParsing
Write-Host "      Downloaded."

# 2. Extract
Write-Host "[2/4] Extracting Python..."
Expand-Archive -Path $zipPath -DestinationPath $DEST -Force
Remove-Item $zipPath
Write-Host "      Extracted."

# 3. Enable pip in embeddable Python
# The ._pth file blocks site-packages by default — uncomment import site
$pthFile = Get-ChildItem $DEST -Filter "python*._pth" | Select-Object -First 1
if ($pthFile) {
    $pthContent = Get-Content $pthFile.FullName -Raw
    $pthContent = $pthContent -replace "#import site", "import site"
    Set-Content $pthFile.FullName $pthContent
    Write-Host "      Enabled site-packages in $($pthFile.Name)"
}

# 4. Download and run get-pip.py
Write-Host "[3/4] Installing pip..."
$getPipPath = "$DEST\get-pip.py"
Invoke-WebRequest -Uri $PIP_URL -OutFile $getPipPath -UseBasicParsing
& $PY_EXE $getPipPath --no-warn-script-location
Remove-Item $getPipPath
Write-Host "      pip installed."

# 5. Install dependencies
Write-Host "[4/4] Installing Pillow, pillow-heif, piexif..."
$pipExe = "$DEST\Scripts\pip.exe"
& $pipExe install Pillow pillow-heif piexif --no-warn-script-location
Write-Host "      Dependencies installed."

Write-Host ""
Write-Host "=========================================="
Write-Host "  Done! Bundled Python ready at: $DEST"
Write-Host "  Now run BUILD.bat to package the app."
Write-Host "=========================================="
Write-Host ""