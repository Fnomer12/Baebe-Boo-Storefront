@echo off
rem Baebe Boo till printer setup - double-click this file. Nothing to install by hand.
rem It sets up printing on this till step by step, then tells you when it is done.
setlocal
cd /d "%~dp0"
echo.
echo  ============================================================
echo   Baebe Boo till printer setup
echo   Keep this window open until you see DONE or an error.
echo  ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
echo.
if errorlevel 1 (
  echo  SETUP DID NOT FINISH. Take a photo of this window and send it to support.
) else (
  echo  DONE. You can close this window and go back to the Baebe Boo page.
  echo  Press Refresh on the printer list if it still shows the old message.
)
echo.
pause
