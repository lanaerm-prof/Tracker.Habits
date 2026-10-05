@echo off
chcp 65001 >nul
title Ритм — трекер привычек
cd /d "%~dp0"
set PORT=8123

echo.
echo   Запуск локального сервера...
echo   Откройте в браузере: http://127.0.0.1:%PORT%/
echo   Для остановки закройте это окно (Ctrl+C).
echo.

start "" "http://127.0.0.1:%PORT%/"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT%
) else (
  py -m http.server %PORT%
)

pause
