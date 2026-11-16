@echo off
setlocal EnableExtensions
set "PROJECT_DIR=%~dp0"
if exist "%PROJECT_DIR%package.json" goto project_found
if exist "E:\campus-smart-dispatch-platform\package.json" set "PROJECT_DIR=E:\campus-smart-dispatch-platform\"
:project_found
if not exist "%PROJECT_DIR%scripts\create-shortcut.ps1" (
  echo [ERROR] Project directory not found.
  echo Run this BAT from the project folder.
  echo.
  pause
  exit /b 1
)
cd /d "%PROJECT_DIR%"
title Campus Smart Dispatch Platform - create desktop shortcut
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\create-shortcut.ps1"
echo.
pause
