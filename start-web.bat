@echo off
rem Benesys Billing - Online mode (web). Double-click to run.
rem First run: installs packages and creates the benesys_billing database
rem (asks once for the PostgreSQL "postgres" password). Every run: updates the
rem tables, then starts the server and the web app in two windows.

setlocal EnableExtensions
cd /d "%~dp0"
title Benesys Billing - starting

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  goto :fail
)

if not exist "node_modules\" (
  echo Installing app packages - first time only...
  call npm ci
  if errorlevel 1 goto :fail
)

if not exist "server\node_modules\" (
  echo Installing server packages - first time only...
  pushd server
  call npm ci
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)

if not exist "server\.env" (
  call :setup
  if errorlevel 1 goto :fail
)

echo Updating database tables...
pushd server
call npm run db:migrate
if errorlevel 1 (
  popd
  goto :fail
)
popd

start "Benesys Server" /d "%~dp0server" cmd /k npm run dev
start "Benesys Web" /d "%~dp0" cmd /k npx expo start --web --port 8081

echo.
echo Started. The browser opens by itself in a few seconds:
echo   http://localhost:8081
echo To stop, close the "Benesys Server" and "Benesys Web" windows.
timeout /t 10 >nul
exit /b 0


:setup
set "PSQL=psql"
where psql >nul 2>nul
if errorlevel 1 set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo.
echo First-time setup: creating the benesys_billing database.
set /p "PGPASSWORD=Enter the PostgreSQL 'postgres' user password: "

rem The app's own database password: random, and kept only in server\.env.
for /f "usebackq delims=" %%p in (`node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`) do set "APP_PW=%%p"

"%PSQL%" -h localhost -U postgres -w -v pw="%APP_PW%" -f server\setup.sql
if errorlevel 1 (
  set "PGPASSWORD="
  echo [!] Could not create the database. Is the password right and PostgreSQL running?
  exit /b 1
)
set "PGPASSWORD="

node -e "require('fs').writeFileSync('server/.env', 'DATABASE_URL=postgres://benesys_billing:' + process.env.APP_PW + '@localhost:5432/benesys_billing\nPORT=4747\nCORS_ORIGINS=*\n')"
if errorlevel 1 exit /b 1
echo Database ready.
exit /b 0


:fail
echo.
echo [!] Something went wrong - see the messages above.
pause
exit /b 1
