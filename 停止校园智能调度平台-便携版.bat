@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\portable-stop.ps1"
exit /b %errorlevel%
