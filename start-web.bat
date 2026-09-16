@echo off
rem Benesys Billing - Online mode. Double-click to run.
rem
rem One click does the lot: installs the packages, creates the database on the
rem very first run, updates the tables, rebuilds the web app if anything in it
rem changed, and hands the whole thing to pm2 - so it keeps running in the
rem background, restarts itself if it falls over, and comes back on its own
rem when this computer is switched on again.
rem
rem Safe to run again any time. Nothing here is deleted and nothing is asked
rem twice; a run where nothing has changed takes seconds.

setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Benesys Billing - starting
set "APP_NAME=benesys-billing"
set "APP_URL=http://localhost:4747"

echo ============================================
echo    Benesys Billing - Online mode
echo ============================================
echo.

rem ---------------------------------------------------------------- Node --
echo [1/6] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo       [!] Node.js is not installed.
  echo           Install it from https://nodejs.org and run this again.
  goto :fail
)
for /f "delims=" %%v in ('node -v') do echo       Node %%v
echo.

rem ------------------------------------------------------------ Packages --
echo [2/6] Checking packages...
if not exist "node_modules\" (
  echo       Installing app packages - first time only, this takes a few minutes...
  call npm ci
  if errorlevel 1 goto :fail
) else (
  echo       App packages ready.
)
if not exist "server\node_modules\" (
  echo       Installing server packages...
  pushd server
  call npm ci
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
) else (
  echo       Server packages ready.
)
call pm2 -v >nul 2>nul
if errorlevel 1 (
  echo       Installing pm2...
  call npm install -g pm2 pm2-windows-startup
  if errorlevel 1 goto :fail
) else (
  echo       pm2 ready.
)
echo.

rem ------------------------------------------------------------ Database --
echo [3/6] Preparing the database...
if not exist "server\.env" (
  call :setup
  if errorlevel 1 goto :fail
)
pushd server
call npm run db:migrate
if errorlevel 1 (
  popd
  echo       [!] The database could not be reached.
  echo           Check that PostgreSQL is running, then run this again.
  goto :fail
)
popd
echo       Tables up to date.
echo.

rem ----------------------------------------------------------- Web build --
echo [4/6] Checking the web app...
set "BUILD_STATE=BUILD"
for /f "delims=" %%s in ('node scripts\needs-web-build.js') do set "BUILD_STATE=%%s"
if /i "!BUILD_STATE!"=="FRESH" (
  echo       Already built, nothing has changed.
) else (
  echo       Building - this takes a few minutes...
  call npx expo export --platform web --output-dir dist
  if errorlevel 1 goto :fail
  echo       Build complete.
)
echo.

rem ----------------------------------------------------------------- pm2 --
echo [5/6] Starting the service...
call pm2 delete %APP_NAME% >nul 2>nul
call pm2 start ecosystem.config.js >nul
if errorlevel 1 (
  echo       [!] pm2 could not start it.
  call pm2 logs %APP_NAME% --lines 30 --nostream
  goto :fail
)
call pm2 save --force >nul 2>nul
call pm2-startup install >nul 2>nul
call pm2 save --force >nul 2>nul
echo       Running under pm2, and set to start with Windows.
echo.

rem --------------------------------------------------------------- Check --
echo [6/6] Waiting for the server...
rem ping, not timeout: timeout refuses to run when this script is started by
rem anything that redirects input (a scheduler, another script, a remote shell).
set "READY="
for /l %%i in (1,1,25) do (
  if not defined READY (
    ping -n 2 127.0.0.1 >nul
    curl -s -o nul %APP_URL%/api/health && set "READY=1"
  )
)
if not defined READY (
  echo       [!] The server did not answer. Its own log says:
  echo.
  call pm2 logs %APP_NAME% --lines 30 --nostream
  goto :fail
)
echo       Server is up.
echo.

set "LANIP="
rem No "!" anywhere in this line: delayed expansion would eat it and the rest.
for /f "delims=" %%i in ('node -e "const n=require('os').networkInterfaces();const a=Object.values(n).flat().find(x=>x&&x.family==='IPv4'&&x.internal===false);console.log(a?a.address:'')"') do set "LANIP=%%i"

start "" %APP_URL%

echo ============================================
echo    Ready
echo ============================================
echo.
echo   This computer      %APP_URL%
if defined LANIP echo   Other devices      http://!LANIP!:4747
echo.
echo   It keeps running in the background - you can close this window,
echo   and it starts again by itself when the computer is restarted.
echo.
echo   pm2 status                    is it running?
echo   pm2 logs %APP_NAME%      what is it doing?
echo   pm2 restart %APP_NAME%   restart it
echo   pm2 stop %APP_NAME%      stop it
echo.
ping -n 11 127.0.0.1 >nul
exit /b 0


rem ------------------------------------------------- first-run DB set-up --
:setup
set "PSQL=psql"
where psql >nul 2>nul
if errorlevel 1 set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo.
echo       First-time set-up: creating the benesys_billing database.
set /p "PGPASSWORD=      Enter the PostgreSQL 'postgres' user password: "

rem The app's own database password: random, and kept only in server\.env.
for /f "usebackq delims=" %%p in (`node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`) do set "APP_PW=%%p"

"%PSQL%" -h localhost -U postgres -w -v pw="%APP_PW%" -f server\setup.sql
if errorlevel 1 (
  set "PGPASSWORD="
  echo       [!] Could not create the database.
  echo           Is that the right password, and is PostgreSQL running?
  exit /b 1
)
set "PGPASSWORD="

node -e "require('fs').writeFileSync('server/.env', 'DATABASE_URL=postgres://benesys_billing:' + process.env.APP_PW + '@localhost:5432/benesys_billing\nPORT=4747\nCORS_ORIGINS=*\n')"
if errorlevel 1 exit /b 1
echo       Database created.
exit /b 0


:fail
echo.
echo   [!] Something went wrong - see the messages above.
echo.
pause
exit /b 1
