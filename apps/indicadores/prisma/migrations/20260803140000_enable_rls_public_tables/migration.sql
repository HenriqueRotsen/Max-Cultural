-- Enable RLS on app tables in the active schema (public or fluxo).
-- Sem políticas: roles anon/authenticated não leem dados via PostgREST.
-- O owner da tabela (conexão Prisma) continua bypassando RLS (sem FORCE).

DO $$
DECLARE
  sch text := current_schema();
  t text;
  tables text[] := ARRAY[
    'audit_logs',
    'auth_sessions',
    'contextos',
    'email_otps',
    'geo_cache',
    'inscricoes',
    'oficinas',
    'password_reset_tokens',
    'permissions',
    'projetos',
    'role_data_scopes',
    'role_permissions',
    'roles',
    'user_data_scopes',
    'user_permissions',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('%I.%I', sch, t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', sch, t);
    END IF;
  END LOOP;
END $$;
