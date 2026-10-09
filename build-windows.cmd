@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
rem Use the isolated build tools prepared on this computer when available.
set "FOLIA_BUILD_TOOLS=%LOCALAPPDATA%\FoliaLyricsBuild"
for /d %%D in ("%FOLIA_BUILD_TOOLS%\node-v24.*-win-x64") do if exist "%%~D\node.exe" set "PATH=%%~D;%PATH%"
if exist "%FOLIA_BUILD_TOOLS%\dotnet\dotnet.exe" (
  set "DOTNET_ROOT=%FOLIA_BUILD_TOOLS%\dotnet"
  set "PATH=%FOLIA_BUILD_TOOLS%\dotnet;%PATH%"
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo 构建需要 Node.js 24 或更新版本。
  exit /b 1
)
dotnet --list-sdks 2>nul | findstr /b "10." >nul
if errorlevel 1 (
  echo 构建需要 .NET SDK 10。
  exit /b 1
)
rem Keep each native desktop version in its own output directory.
set "FOLIA_VERSION="
for /f "delims=" %%V in ('dotnet msbuild native/FoliaLyrics.csproj -getProperty:Version -nologo') do set "FOLIA_VERSION=%%V"
if not defined FOLIA_VERSION (
  echo 无法读取桌面程序版本。
  exit /b 1
)
set "FOLIA_OUTPUT=release\%FOLIA_VERSION%\win-x64"
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm run typecheck:desktop
if errorlevel 1 exit /b 1
call npm run build:desktop
if errorlevel 1 exit /b 1
node tools/package-web.mjs
if errorlevel 1 exit /b 1
dotnet publish native/FoliaLyrics.csproj -c Release -r win-x64 --self-contained true -o "%FOLIA_OUTPUT%"
if errorlevel 1 exit /b 1
for %%F in (LICENSE README-DESKTOP.md CHANGELOG-DESKTOP.md) do (
  copy /y "%%F" "%FOLIA_OUTPUT%\%%F" >nul
  if errorlevel 1 exit /b 1
)
xcopy "licenses" "%FOLIA_OUTPUT%\licenses\" /e /i /y >nul
if errorlevel 1 exit /b 1
echo 编译完成：%FOLIA_OUTPUT%\FoliaLyrics.exe
