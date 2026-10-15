-- Migration: Drop redundant firm-scope tables
-- Architecture: ONE DB PER FIRM — firm_id columns and firm tables are unnecessary.
-- These 6 tables were created in migration 2026-01-16_03 but are fully replaced by
-- the tenant_subscriptions / subscription_plans system and per-DB isolation.
--
-- IMPORTANT: Run this AFTER verifying no runtime code references these tables.
-- All runtime references were removed in the refactoring sessions.

BEGIN;

-- 1. Drop tables in dependency order (children first)
DROP TABLE IF EXISTS firm_usage_events   CASCADE;
DROP TABLE IF EXISTS firm_signing_policy CASCADE;
DROP TABLE IF EXISTS firm_plan_overrides CASCADE;
DROP TABLE IF EXISTS firm_subscriptions  CASCADE;
DROP TABLE IF EXISTS firm_users          CASCADE;
DROP TABLE IF EXISTS firms               CASCADE;

-- 2. Remove the firmid column from signingfiles if it exists
-- (was added in 2026-01-16_03 but is unused in one-db-per-firm architecture)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'signingfiles'
          AND column_name = 'firmid'
    ) THEN
        ALTER TABLE signingfiles DROP COLUMN firmid;
    END IF;
END
$$;

COMMIT;
