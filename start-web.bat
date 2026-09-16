@echo off
rem Benesys Billing - Online mode. Double-click to run.
rem
rem One click does the lot, on a computer with nothing on it: installs Node.js
rem and PostgreSQL if they are missing, then the packages, creates the database
rem the very first time, updates the tables, rebuilds the web app if anything in
rem it changed, and hands the whole thing to pm2 - so it keeps running in the
rem background, restarts itself if it falls over, and comes back on its own when
rem this computer is switched on again.
rem
rem Safe to run again any time. Nothing here is deleted and nothing is asked
rem twice; a run where nothing has changed takes seconds, and Windows only asks
rem for administrator permission when something actually has to be installed.

setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Benesys Billing - starting
set "APP_NAME=benesys-billing"
set "APP_URL=http://localhost:4747"
set "PG_PW_FILE=%~dp0postgres-password.txt"

echo ============================================
echo    Benesys Billing - Online mode
echo ============================================
echo.

rem ------------------------------------------------- what is missing, if any --
echo [1/7] Checking Node.js and PostgreSQL...

set "NEED_NODE="
where node >nul 2>nul || set "NEED_NODE=1"

call :find_psql
set "NEED_PG="
if not defined PSQL set "NEED_PG=1"

if defined NEED_NODE call :need_admin || goto :fail
if defined NEED_PG call :need_admin || goto :fail

if defined NEED_NODE call :install_node || goto :fail
if defined NEED_PG call :install_postgres || goto :fail

for /f "delims=" %%v in ('node -v') do echo       Node %%v
echo       PostgreSQL at !PSQL!
echo.

rem ------------------------------------------------------------- Packages --
echo [2/7] Checking packages...
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

rem ------------------------------------------------------------- Database --
echo [3/7] Preparing the database...
if not exist "server\.env" (
  call :create_database
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

rem ------------------------------------------------------------ Web build --
echo [4/7] Checking the web app...
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

rem ------------------------------------------------------------------ pm2 --
echo [5/7] Starting the service...
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

rem ---------------------------------------------------------------- Check --
echo [6/7] Waiting for the server...
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

echo [7/7] Opening the app...
rem No "!" anywhere in this line: delayed expansion would eat it and the rest.
set "LANIP="
for /f "delims=" %%i in ('node -e "const n=require('os').networkInterfaces();const a=Object.values(n).flat().find(x=>x&&x.family==='IPv4'&&x.internal===false);console.log(a?a.address:'')"') do set "LANIP=%%i"
start "" %APP_URL%
echo.

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


rem ==========================================================================
rem  Helpers
rem ==========================================================================

rem -- Where psql is, if PostgreSQL is installed at all. Sets PSQL, or leaves
rem -- it empty. Newest version first: an older one left behind on the machine
rem -- should not be preferred to the one actually being used.
:find_psql
set "PSQL="
where psql >nul 2>nul && set "PSQL=psql"
if defined PSQL exit /b 0
for %%v in (18 17 16 15 14 13) do (
  if not defined PSQL (
    if exist "C:\Program Files\PostgreSQL\%%v\bin\psql.exe" (
      set "PSQL=C:\Program Files\PostgreSQL\%%v\bin\psql.exe"
      set "PATH=!PATH!;C:\Program Files\PostgreSQL\%%v\bin"
    )
  )
)
exit /b 0


rem -- Installing needs administrator rights. Ask for them once, by starting
rem -- this same file again elevated, and let this copy go. Nothing has been
rem -- changed at this point, so there is nothing half-done to leave behind.
:need_admin
net session >nul 2>nul
if not errorlevel 1 exit /b 0
echo.
echo       Something has to be installed, so Windows will ask for permission.
echo       Say Yes to the box that appears - this window can then be closed.
echo.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
ping -n 4 127.0.0.1 >nul
exit /b 1


:install_node
echo       Installing Node.js - a few minutes...
winget install --id OpenJS.NodeJS.LTS --source winget --silent --accept-package-agreements --accept-source-agreements
if exist "C:\Program Files\nodejs\node.exe" set "PATH=%PATH%;C:\Program Files\nodejs"
where node >nul 2>nul
if errorlevel 1 (
  echo       [!] Node.js could not be installed automatically.
  echo           Install it from https://nodejs.org and run this file again.
  exit /b 1
)
echo       Node.js installed.
exit /b 0


rem -- PostgreSQL, with a password we pick ourselves, so nobody has to be asked
rem -- for one they were never told. It is written next to this file because it
rem -- is the only copy there will ever be, and the shop will need it the day
rem -- somebody has to look after this database.
:install_postgres
echo       Installing PostgreSQL - a large download, please leave it running...
for /f "usebackq delims=" %%p in (`node -e "console.log(require('crypto').randomBytes(15).toString('base64url'))"`) do set "PG_SUPER=%%p"
winget install --id PostgreSQL.PostgreSQL.18 --source winget --silent --accept-package-agreements --accept-source-agreements --custom "--superpassword !PG_SUPER! --serverport 5432"
call :find_psql
if not defined PSQL (
  echo       [!] PostgreSQL could not be installed automatically.
  echo           Install it from https://www.postgresql.org/download/windows/
  echo           and run this file again.
  exit /b 1
)
echo PostgreSQL 'postgres' superuser password: !PG_SUPER!> "%PG_PW_FILE%"
echo Written by start-web.bat when PostgreSQL was installed. Keep it safe.>> "%PG_PW_FILE%"
echo       PostgreSQL installed.
echo       Its administrator password is in postgres-password.txt - keep that file.
exit /b 0


rem -- First run only: the app's own role and database, and server\.env.
:create_database
echo.
echo       First-time set-up: creating the benesys_billing database.
if defined PG_SUPER set "PGPASSWORD=!PG_SUPER!"
if not defined PG_SUPER set /p "PGPASSWORD=      Enter the PostgreSQL 'postgres' user password: "

rem The app's own database password: random, and kept only in server\.env.
for /f "usebackq delims=" %%p in (`node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`) do set "APP_PW=%%p"

"!PSQL!" -h localhost -U postgres -w -v pw="!APP_PW!" -f server\setup.sql
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
