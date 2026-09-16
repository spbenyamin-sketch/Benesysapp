-- One-time setup, run as the postgres superuser (start-web.bat does this on
-- its first run):
--   psql -h localhost -U postgres -v pw='app-password' -f server/setup.sql
-- Safe to run again: the role's password is reset to `pw`, nothing is dropped.
-- Its own role and database names, so no other project's database is touched.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE benesys_billing LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'benesys_billing') \gexec

SELECT format('ALTER ROLE benesys_billing WITH LOGIN PASSWORD %L', :'pw') \gexec

SELECT 'CREATE DATABASE benesys_billing OWNER benesys_billing ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'benesys_billing') \gexec
