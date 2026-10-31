@echo off
rem Benesys Billing - Online mode. Put the books back from a backup.
rem
rem The server copies its whole database into a backup every day it is on
rem (Documents\Benesys Billing Backups, unless server\.env says BACKUP_DIR=...).
rem This lists those backups, asks which one, and asks you to type YES.
rem
rem Everything entered after that backup is replaced - so it first takes one
rem more backup of the books as they are now. Picked the wrong day? Run this
rem again and pick the "before-restore" one.

setlocal EnableExtensions
cd /d "%~dp0"
title Benesys Billing - restore a backup

echo ============================================
echo    Benesys Billing - restore a backup
echo ============================================

if not exist "server\.env" (
  echo.
  echo  This computer has not been set up yet - run start-web.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo.
  echo  The server packages are not installed - run start-web.bat first.
  echo.
  pause
  exit /b 1
)

rem The server is stopped while the tables are swapped, so nobody bills into
rem books that are halfway through being replaced.
set "HAVE_PM2="
call pm2 -v >nul 2>nul && set "HAVE_PM2=1"
if defined HAVE_PM2 call pm2 stop benesys-billing >nul 2>nul

pushd server
call npx tsx --env-file=.env src/tools/restore-backup.ts
set "RC=%ERRORLEVEL%"
rem A backup from before an update has older tables; bring them up to date.
if "%RC%"=="0" call npm run db:migrate >nul
popd

if defined HAVE_PM2 (
  call pm2 restart benesys-billing >nul 2>nul
  echo  The server is running again.
)

echo.
pause
exit /b %RC%
