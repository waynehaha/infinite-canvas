@echo off
chcp 65001 >nul
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\desktop\windows-launcher.ps1" -Action start
if errorlevel 1 (
  echo.
  pause
)
