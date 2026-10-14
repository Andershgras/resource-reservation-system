-- Creates or updates the API's own SQL login. It can read and write data, but
-- can't change the schema: only the migrator can (ADR 0005).
--
-- Docker Compose runs this with sqlcmd after the migrations, as sa. It can be
-- run again at any time: it sets the password again, which is how to change it.
--
-- sqlcmd reads the variables from environment variables of the same name:
-- DatabaseName, AppLogin and AppPassword. The password must not contain a
-- single quote.

:on error exit

USE [master];

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(AppLogin)')
    CREATE LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)', DEFAULT_DATABASE = [$(DatabaseName)], CHECK_POLICY = ON;
ELSE
    ALTER LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)';
GO

USE [$(DatabaseName)];

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(AppLogin)')
    CREATE USER [$(AppLogin)] FOR LOGIN [$(AppLogin)];

ALTER ROLE db_datareader ADD MEMBER [$(AppLogin)];
ALTER ROLE db_datawriter ADD MEMBER [$(AppLogin)];
GO
