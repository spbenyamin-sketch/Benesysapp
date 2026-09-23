@echo off
rem Benesys Billing - Online mode. Forgotten password? Double-click this.
rem
rem Run it on the computer that holds the shop's books (the same one
rem start-web.bat runs on). It lists the accounts on this server, asks which one
rem and what the new password should be, and sets it. Nothing else is touched -
rem no bill, no customer, no setting.
rem
rem Staff do not need this: the owner sets a staff password in the app itself,
rem under Settings - People.

setlocal EnableExtensions
cd /d "%~dp0"
title Benesys Billing - reset a password

echo ============================================
echo    Benesys Billing - reset a password
echo ============================================
echo.

if not exist "server\.env" (
  echo  This computer has not been set up yet - run start-web.bat first.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is missing - run start-web.bat first, it installs it.
  echo.
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo  The server packages are not installed - run start-web.bat first.
  echo.
  pause
  exit /b 1
)

pushd server
call npx tsx --env-file=.env src/tools/reset-password.ts
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
  echo  Nothing was changed.
  goto :done
)

rem Five wrong guesses lock that name out for 15 minutes, and the server keeps
rem that count in its own memory - so somebody who forgot their password has
rem usually earned the lock before they get here, and a new password alone would
rem still be refused. Restarting the server forgets the count.
call pm2 -v >nul 2>nul
if errorlevel 1 goto :done
call pm2 restart benesys-billing >nul 2>nul
if errorlevel 1 goto :done
echo  The server was restarted, so any "try again in 15 minutes" is cleared too.

:done

echo.
pause
exit /b %RC%
