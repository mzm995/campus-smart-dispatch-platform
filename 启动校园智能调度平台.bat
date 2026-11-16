@echo off
setlocal EnableExtensions
set "PROJECT_DIR=%~dp0"
if exist "%PROJECT_DIR%package.json" goto project_found
if exist "E:\campus-smart-dispatch-platform\package.json" set "PROJECT_DIR=E:\campus-smart-dispatch-platform\"
:project_found
if not exist "%PROJECT_DIR%package.json" (
  echo [ERROR] Project directory not found.
  echo Run this BAT from the project folder or use the desktop shortcut.
  echo.
  pause
  exit /b 1
)
cd /d "%PROJECT_DIR%"
title Campus Smart Dispatch Platform
set "NODE_NO_WARNINGS=1"
set "URL=http://localhost:5173/"

echo ============================================
echo  Campus Smart Dispatch Platform
echo ============================================
echo.

echo Preparing Node.js 24 runtime...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\bootstrap-node.ps1" -Purpose launcher -LogPath "%PROJECT_DIR%runtime-bootstrap.log"
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js runtime preparation failed.
  echo Review runtime-bootstrap.log and the messages above.
  echo Check network access, proxy/firewall settings and project write permission.
  echo.
  pause
  exit /b 1
)
set "PATH=%PROJECT_DIR%runtime;%PROJECT_DIR%runtime\node_modules\npm\bin;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bundled Node.js runtime is unavailable.
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Bundled npm is unavailable.
  echo.
  pause
  exit /b 1
)

node -e "import('node:sqlite').then(()=>process.exit(0)).catch(()=>process.exit(1))"
if errorlevel 1 (
  echo [ERROR] This Node.js build does not support node:sqlite.
  echo Install Node.js 24 LTS and retry.
  echo.
  pause
  exit /b 1
)

rem If frontend and API are both running, just open the browser.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$front=$false; $api=$false; try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; $front=($r.StatusCode -eq 200 -and $r.Content -match '/src/main\.js') } catch {}; try { $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 2; $api=($h.ok -eq $true -and $h.data.status -eq 'ok' -and $h.data.service -eq 'campus-smart-dispatch-platform-api') } catch {}; if ($front -and $api) { exit 0 }; if ($front -or $api) { exit 2 }; exit 1"
if errorlevel 2 (
  echo [ERROR] Only one part of the full-stack app is running.
  echo Run the stop launcher first, then launch again.
  echo.
  pause
  exit /b 1
)
if not errorlevel 1 (
  echo Frontend and API are already running. Opening browser...
  start "" "%URL%"
  exit /b 0
)

echo Checking required dependencies...
call node "%~dp0scripts\ensure-deps.mjs" --context=launcher
if errorlevel 1 (
  echo.
  echo [ERROR] Dependency preparation failed. Review the messages above.
  echo Check network access, npm registry settings and node_modules write permissions.
  pause
  exit /b 1
)
set "SKIP_DEPENDENCY_CHECK=1"

echo.
echo Starting Vue frontend and Node.js/SQLite backend.
echo The browser will open automatically.
echo Keep this window open. Close it or press Ctrl+C to stop.
echo If port 5173 is busy, close it or run the stop launcher first.
echo.
call npm run dev -- --open

echo.
if errorlevel 1 (
  echo [ERROR] Full-stack dev server exited with an error.
  echo If the port is already in use, run the stop launcher and try again.
) else (
  echo Dev server stopped.
)
pause
