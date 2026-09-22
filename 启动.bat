@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto NONODE
node serve.js
goto END
:NONODE
echo Node.js not found. Opening index.html directly...
start "" "index.html"
:END
pause
