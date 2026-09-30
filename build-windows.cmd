@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm run typecheck:desktop
if errorlevel 1 exit /b 1
call npm run build:desktop
if errorlevel 1 exit /b 1
node tools/package-web.mjs
if errorlevel 1 exit /b 1
dotnet publish native/FoliaLyrics.csproj -c Release -r win-x64 --self-contained true -o release/win-x64
if errorlevel 1 exit /b 1
echo 编译完成：release\win-x64\FoliaLyrics.exe
