-- Least-privilege grants for the Longrun database (ADR 0004).
-- Run as the Entra administrator, connected to the `longrun` database, AFTER the login
-- roles exist (docs/runbooks/database-bootstrap.md). Idempotent.
--
--   longrun_migrator        owns the schema objects; used only by the CI migration job
--   longrun_app             group role with data access only (no DDL)
--   longrun_app_production  login of the production slot identity, member of longrun_app
--   longrun_app_staging     login of the staging slot identity, member of longrun_app
--
-- The same file is exercised by test/db/roles.int.test.ts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'longrun_app') THEN
    CREATE ROLE longrun_app NOLOGIN;
  END IF;
END
$$;

GRANT longrun_app TO longrun_app_production, longrun_app_staging;

-- Nobody but the migrator creates objects in public (PostgreSQL 15+ already revokes this from PUBLIC).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO longrun_migrator;
GRANT USAGE ON SCHEMA public TO longrun_app;

GRANT CONNECT ON DATABASE longrun TO longrun_migrator, longrun_app;

-- Tables and sequences the migrator creates are usable, but not alterable, by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE longrun_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO longrun_app;
ALTER DEFAULT PRIVILEGES FOR ROLE longrun_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO longrun_app;
