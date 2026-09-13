@echo off
rem Baebe Boo printer connector launcher (Windows).
rem Staff never touch Node directly: this finds a Node 20+ runtime
rem (PATH, well-known install locations, or a bundled .\node folder)
rem and starts the bridge next to this file. Settings come from an
rem optional bridge.env file beside this launcher (KEY=VALUE per line).
setlocal
cd /d "%~dp0"

if exist "%~dp0bridge.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0bridge.env") do @set "%%A=%%B"
)

set "NODE="
if defined BAEBE_BRIDGE_NODE (
  if exist "%BAEBE_BRIDGE_NODE%" set "NODE=%BAEBE_BRIDGE_NODE%"
)
if not defined NODE (
  for %%P in ("%~dp0node\node.exe" "%LOCALAPPDATA%\Programs\nodejs\node.exe" "%ProgramFiles%\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node.exe") do (
    if exist %%P (
      set "NODE=%%~P"
      goto :have_node
    )
  )
  where node >nul 2>nul
  if not errorlevel 1 (
    for /f "delims=" %%N in ('where node') do (
      set "NODE=%%N"
      goto :have_node
    )
  )
)
if not defined NODE (
  echo Baebe Boo printer connector needs Node.js 20+. Re-run install-windows.ps1 ^(it installs Node automatically^) or set BAEBE_BRIDGE_NODE to node.exe. >&2
  pause
  exit /b 1
)

:have_node
"%NODE%" -e "process.exit(parseInt(process.versions.node.split('.')[0],10)>=20?0:1)" >nul 2>nul
if errorlevel 1 (
  echo Baebe Boo printer connector needs Node.js 20+ but found: & "%NODE%" --version >&2
  echo Install a newer Node, delete the bundled node folder to re-download, or set BAEBE_BRIDGE_NODE. >&2
  pause
  exit /b 1
)

if not exist "%~dp0local-printer-bridge.mjs" (
  echo local-printer-bridge.mjs is missing next to %~nx0. Re-extract the download. >&2
  pause
  exit /b 1
)

rem Keep a log next to the launcher so problems can be diagnosed afterwards.
>>"%~dp0bridge.log" echo [%date% %time%] Starting Baebe Boo printer connector.
"%NODE%" "%~dp0local-printer-bridge.mjs" %* >>"%~dp0bridge.log" 2>&1
echo Baebe Boo printer connector stopped ^(code %errorlevel%^). Last lines of bridge.log: >&2
powershell -NoProfile -Command "Get-Content '%~dp0bridge.log' -Tail 8" >&2
pause
