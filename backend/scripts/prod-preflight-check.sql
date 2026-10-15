-- =============================================================================
-- PRODUCTION PRE-FLIGHT VERIFICATION SCRIPT
-- Run this BEFORE deploying the new code to verify DB state.
-- =============================================================================

BEGIN;

-- 1. Verify core tables exist
DO $$
DECLARE
    required_tables text[] := ARRAY[
        'users', 'cases', 'casedescriptions', 'casetypes', 'casetypedescriptions',
        'signingfiles', 'signaturespots', 'signing_consents', 'signing_otp_challenges',
        'audit_events', 'uploadedfiles', 'userdevices', 'usernotifications',
        'otps', 'refresh_tokens', 'subscription_plans', 'tenant_subscriptions',
        'data_retention_runs', 'scheduled_email_reminders', 'message_delivery_events',
        'signing_retention_warnings'
    ];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY required_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            RAISE EXCEPTION 'MISSING TABLE: %', tbl;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ All % core tables exist', array_length(required_tables, 1);
END $$;

-- 2. Verify firm tables are GONE (should not exist after drop migration)
DO $$
DECLARE
    dropped_tables text[] := ARRAY[
        'firms', 'firm_users', 'firm_subscriptions',
        'firm_plan_overrides', 'firm_usage_events', 'firm_signing_policy'
    ];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY dropped_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            RAISE EXCEPTION 'UNEXPECTED TABLE still exists: % — run drop migration first', tbl;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ All 6 firm tables successfully removed';
END $$;

-- 3. Verify firmid column is gone from signingfiles
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'signingfiles' AND column_name = 'firmid'
    ) THEN
        RAISE EXCEPTION 'signingfiles.firmid column still exists — run drop migration';
    END IF;
    RAISE NOTICE '✓ signingfiles.firmid column removed';
END $$;

-- 4. Verify scheduled_email_reminders structure
DO $$
DECLARE
    required_cols text[] := ARRAY[
        'id', 'user_id', 'client_name', 'to_email', 'subject',
        'template_key', 'scheduled_for', 'status', 'created_at'
    ];
    col text;
BEGIN
    FOREACH col IN ARRAY required_cols LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'scheduled_email_reminders' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'scheduled_email_reminders missing column: %', col;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ scheduled_email_reminders schema verified';
END $$;

-- 5. Verify subscription_plans has at least 1 row (seeded)
DO $$
DECLARE
    cnt integer;
BEGIN
    SELECT count(*) INTO cnt FROM subscription_plans;
    IF cnt = 0 THEN
        RAISE WARNING 'subscription_plans is empty — seed plans should exist';
    ELSE
        RAISE NOTICE '✓ subscription_plans has % plan(s)', cnt;
    END IF;
END $$;

-- 6. Verify indexes exist on performance-critical columns
DO $$
DECLARE
    idx_checks text[][] := ARRAY[
        ARRAY['cases', 'userid'],
        ARRAY['cases', 'casetypeid'],
        ARRAY['cases', 'casemanagerid'],
        ARRAY['casedescriptions', 'caseid'],
        ARRAY['signingfiles', 'caseid'],
        ARRAY['usernotifications', 'recipientuserid'],
        ARRAY['audit_events', 'actor_user_id']
    ];
    check_pair text[];
    tbl text;
    col text;
    idx_exists boolean;
BEGIN
    FOREACH check_pair SLICE 1 IN ARRAY idx_checks LOOP
        tbl := check_pair[1];
        col := check_pair[2];

        SELECT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE tablename = tbl
              AND indexdef ILIKE '%' || col || '%'
        ) INTO idx_exists;

        IF NOT idx_exists THEN
            RAISE WARNING 'No index found on %.% — consider adding one', tbl, col;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ Index check complete';
END $$;

-- 7. Row counts summary
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '--- Row Counts ---';
    FOR r IN
        SELECT tablename, n_live_tup
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        RAISE NOTICE '  % : % rows', r.tablename, r.n_live_tup;
    END LOOP;
END $$;

COMMIT;
