@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Missing runtime\node.exe
  pause
  exit /b 1
)
set "PORT=3001"
set "HOST=127.0.0.1"
set "DATABASE_PATH=%CD%\server\data\campus-smart-dispatch-platform.sqlite"
set "SECRETS_PATH=%CD%\server\data\.secrets-key"
set "NODE_NO_WARNINGS=1"
echo Starting portable server in diagnostic mode...
echo Open http://127.0.0.1:%PORT%/ after the server is ready.
echo Close this window or press Ctrl+C to stop.
echo.
"runtime\node.exe" server\index.js
pause
