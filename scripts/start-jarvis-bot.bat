@echo off
setlocal
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
start "" "%POWERSHELL%" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0start-jarvis-bot.ps1"
exit /b 0