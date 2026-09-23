-- ============================================================================
-- JabSewa MVP V1 — Database Audit Queries (READ-ONLY)
-- ============================================================================
-- Run these in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- All queries are SELECT-only. No data will be modified.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. ALL TABLES in public schema
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  t.table_name,
  t.table_type,
  obj_description((quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) AS table_comment
FROM information_schema.tables t
WHERE t.table_schema = 'public'
ORDER BY t.table_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ALL COLUMNS with data types, defaults, nullability
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  col_description(
    (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
    c.ordinal_position
  ) AS column_comment
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. PRIMARY KEYS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.ordinal_position;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. FOREIGN KEYS (relationships)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc.constraint_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. UNIQUE CONSTRAINTS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. CHECK CONSTRAINTS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  pg_get_constraintdef(c.oid) AS check_definition
FROM information_schema.table_constraints tc
JOIN pg_constraint c
  ON c.conname = tc.constraint_name
  AND c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. ALL INDEXES
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. CUSTOM ENUM TYPES
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  t.typname AS enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. COLUMNS USING ENUM TYPES
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  c.table_name,
  c.column_name,
  c.udt_name AS enum_type
FROM information_schema.columns c
JOIN pg_type t ON t.typname = c.udt_name
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.column_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. FUNCTIONS and TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS return_type,
  pg_get_function_arguments(p.oid) AS arguments,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
  END AS kind
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ──────────────────────────────────────────────────────────────────────────────
-- 12. ROW LEVEL SECURITY — enabled status per table
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 13. EXISTING RLS POLICIES
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 14. TABLE and COLUMN COMMENTS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  c.relname AS table_name,
  obj_description(c.oid) AS table_comment
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND obj_description(c.oid) IS NOT NULL
ORDER BY c.relname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 15. SUPABASE AUTH INTEGRATION — auth.users vs public.users
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'auth'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- ──────────────────────────────────────────────────────────────────────────────
-- 16. GRANTS — who has access to what
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- ──────────────────────────────────────────────────────────────────────────────
-- 17. EXTENSIONS installed
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  extname AS extension_name,
  extversion AS version
FROM pg_extension
ORDER BY extname;

-- ──────────────────────────────────────────────────────────────────────────────
-- 18. ALL SCHEMAS
-- ──────────────────────────────────────────────────────────────────────────────
SELECT
  schema_name,
  schema_owner
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY schema_name;
