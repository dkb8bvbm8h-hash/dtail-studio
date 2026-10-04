@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "D-Tail Studio" http://127.0.0.1:8765
  py -m http.server 8765
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "D-Tail Studio" http://127.0.0.1:8765
  python -m http.server 8765
  goto :eof
)
start "" "%~dp0index.html"
echo.
echo A D-Tail webapp megnyilik helyi fajlkent.
echo A teljes cloud/PWA modhoz telepits Python 3-at, vagy hasznald a Vercel/GitHub valtozatot.
pause
