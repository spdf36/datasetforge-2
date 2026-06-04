@echo off
title DatasetForge Builder
color 0A

echo.
echo  =========================================================
echo   DatasetForge Builder
echo  =========================================================
echo   Build started: %DATE% %TIME%
echo  =========================================================
echo.

echo DatasetForge Build Log > build.log
echo Started: %DATE% %TIME% >> build.log
echo. >> build.log

REM Step 1 - ExifTool check
echo  [1/5] Checking ExifTool...
if exist "public\exiftool\exiftool.exe" (
    echo         OK - exiftool.exe found
    echo [1/5] ExifTool: FOUND >> build.log
) else (
    echo.
    echo  WARNING: public\exiftool\exiftool.exe not found
    echo  The build will continue but EXIF dates will not
    echo  be extracted automatically in the packaged app.
    echo.
    echo [1/5] ExifTool: NOT FOUND >> build.log
    echo  Press any key to continue, or close this window to abort.
    pause >nul
)

REM Step 2 - Bundled Python setup
echo.
echo  [2/5] Setting up bundled Python...
if exist "public\python\python.exe" (
    echo         OK - bundled Python already present
    echo [2/5] Python: ALREADY PRESENT >> build.log
) else (
    echo         Downloading Python embeddable + dependencies...
    echo         This requires internet access and may take 2-3 minutes.
    echo.
    powershell -ExecutionPolicy Bypass -File "scripts\setup_python.ps1"
    if %errorlevel% neq 0 (
        echo.
        echo  WARNING: Python setup failed. Image Tools will use system Python.
        echo  Users without Python installed will see an error in Image Tools.
        echo [2/5] Python setup: FAILED - continuing anyway >> build.log
        echo  Press any key to continue anyway.
        pause >nul
    ) else (
        echo         Done.
        echo [2/5] Python: SETUP OK >> build.log
    )
)

REM Step 3 - npm install
echo.
echo  [3/5] Installing dependencies...
echo         This may take 2-3 minutes on first run.
echo.
echo [3/5] npm install >> build.log
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  FAILED: npm install
    echo  Scroll up to see the error message.
    echo FAILED: npm install >> build.log
    pause
    exit /b 1
)
echo         Done.
echo [OK] npm install >> build.log

REM Step 4 - React build
echo.
echo  [4/5] Compiling React app...
echo         Takes about 30-60 seconds.
echo.
echo [4/5] react-build >> build.log
call npm run react-build
if %errorlevel% neq 0 (
    echo.
    echo  FAILED: React build
    echo  Scroll up to see the error message.
    echo FAILED: react-build >> build.log
    pause
    exit /b 1
)
echo         Done.
echo [OK] react-build >> build.log

REM Step 5 - Electron packager
echo.
echo  [5/5] Packaging Windows installer...
echo         Takes 1-3 minutes.
echo         First run downloads Electron binaries ~80MB - this is normal.
echo.
echo [5/5] electron-builder >> build.log
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo.
    echo  FAILED: electron-builder
    echo  Scroll up to see the error message.
    echo FAILED: electron-builder >> build.log
    pause
    exit /b 1
)
echo [OK] electron-builder >> build.log

REM Done
echo.
echo  =========================================================
echo   BUILD COMPLETE
echo.
echo   Your installer is at:
echo   dist\DatasetForge Setup 1.0.0.exe
echo.
echo   Send that file to your team - nothing else needed.
echo   Python and all dependencies are bundled inside.
echo  =========================================================
echo.
echo BUILD COMPLETE %DATE% %TIME% >> build.log

explorer dist

echo  Press any key to close.
pause >nul