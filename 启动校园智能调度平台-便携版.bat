@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\portable-start.ps1"
exit /b %errorlevel%
