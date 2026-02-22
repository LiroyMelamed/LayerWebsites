-- Verification checks for critical production schema.
-- Run after migrations. If something is missing, this script RAISE EXCEPTION and fails.

DO $$
BEGIN
    -- signingfiles columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signingfileid'
    ) THEN RAISE EXCEPTION 'Missing table/column: public.signingfiles.signingfileid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='lawyerid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.lawyerid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='clientid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.clientid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='filename';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.filename'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='filekey';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.filekey'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='originalfilekey';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.originalfilekey'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='status';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.status'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='createdat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.createdat'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='caseid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.caseid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='notes';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.notes'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='expiresat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.expiresat'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signedfilekey';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.signedfilekey'; END IF;

    -- New signed output storage (required for new signing docs)
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signedstoragekey';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.signedstoragekey'; END IF;

    -- Retention safety fields
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='legalhold';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.legalhold'; END IF;

    -- Two-phase delete markers + plan snapshot at signing
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='pendingdeleteatutc';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.pendingdeleteatutc'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='pendingdeletereason';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.pendingdeletereason'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='plan_key_at_signing';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.plan_key_at_signing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='retention_days_core_at_signing';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.retention_days_core_at_signing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='retention_days_pii_at_signing';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.retention_days_pii_at_signing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='retention_policy_hash_at_signing';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.retention_policy_hash_at_signing'; END IF;

    -- Evidence/hardening fields (required for evidence certificate/package)
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='originalpdfsha256';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.originalpdfsha256'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='presentedpdfsha256';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.presentedpdfsha256'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signedpdfsha256';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.signedpdfsha256'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signedat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.signedat'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='rejectionreason';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.rejectionreason'; END IF;

    -- signaturespots columns
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signaturespotid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signaturespotid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signingfileid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signingfileid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='pagenumber';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.pagenumber'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='x';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.x'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='y';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.y'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='width';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.width'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='height';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.height'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='isrequired';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.isrequired'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='issigned';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.issigned'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signaturedata';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signaturedata'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signername';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signername'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signedat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signedat'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='createdat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.createdat'; END IF;

    -- Multi-signer support column (expected in production)
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signeruserid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signeruserid'; END IF;

    -- Evidence fields on signaturespots
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signingsessionid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signingsessionid'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='presentedpdfsha256';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.presentedpdfsha256'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signaturespots' AND column_name='signatureimagesha256';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signaturespots.signatureimagesha256'; END IF;

    -- Evidence tables
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_events' AND column_name='eventid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.audit_events.eventid'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signing_consents' AND column_name='consentid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.signing_consents.consentid'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signing_otp_challenges' AND column_name='challengeid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.signing_otp_challenges.challengeid'; END IF;

    -- Plan / retention-run tables
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='plan_key';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.subscription_plans.plan_key'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='documents_retention_days_core';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.documents_retention_days_core'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='documents_retention_days_pii';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.documents_retention_days_pii'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='documents_monthly_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.documents_monthly_quota'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='storage_gb_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.storage_gb_quota'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='users_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.users_quota'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='otp_sms_monthly_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.otp_sms_monthly_quota'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='evidence_generations_monthly_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.evidence_generations_monthly_quota'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='evidence_cpu_seconds_monthly_quota';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.subscription_plans.evidence_cpu_seconds_monthly_quota'; END IF;

    -- (firms, firm_users, firm_subscriptions, firm_plan_overrides, firm_usage_events, tenant_subscriptions
    --  were dropped in 2026-02-16_02_drop_redundant_firm_tables.sql — single-DB-per-firm architecture)

    -- signingfiles byte-size columns
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='unsignedpdfbytes';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.unsignedpdfbytes'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signingfiles' AND column_name='signedpdfbytes';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.signingfiles.signedpdfbytes'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='data_retention_runs' AND column_name='run_id';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.data_retention_runs.run_id'; END IF;

    -- Warning scheduler placeholder
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signing_retention_warnings' AND column_name='warning_id';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table/column: public.signing_retention_warnings.warning_id'; END IF;

    -- notifications tables
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='userdevices' AND column_name='userid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.userdevices.userid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='userdevices' AND column_name='fcmtoken';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.userdevices.fcmtoken'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usernotifications' AND column_name='notificationid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.usernotifications.notificationid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usernotifications' AND column_name='userid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.usernotifications.userid'; END IF;

    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usernotifications' AND column_name='createdat';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.usernotifications.createdat'; END IF;

    -- WhatsApp link column
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='whatsappgrouplink';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.cases.whatsappgrouplink'; END IF;

    -- Ensure notifications primary key sequence exists (required for auto-repair logic)
    IF COALESCE(pg_get_serial_sequence('public.usernotifications','notificationid'), '') = '' THEN
        RAISE EXCEPTION 'usernotifications.notificationid has no serial/identity sequence (pg_get_serial_sequence returned NULL)';
    END IF;

    -- ─── Platform settings tables (2026-02-22+) ────────────────────────
    PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='platform_settings';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.platform_settings'; END IF;

    PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='platform_admins';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.platform_admins'; END IF;

    PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notification_channel_config';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.notification_channel_config'; END IF;

    -- admin_cc column on notification_channel_config (2026-02-26)
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_channel_config' AND column_name='admin_cc';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing column: public.notification_channel_config.admin_cc'; END IF;

    -- Birthday greetings tracking table (2026-02-27)
    PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='birthday_greetings_sent';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing table: public.birthday_greetings_sent'; END IF;

    -- Verify key platform_settings rows exist
    PERFORM 1 FROM platform_settings WHERE category='messaging' AND setting_key='SMOOVE_SENDER_PHONE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing platform_settings row: messaging/SMOOVE_SENDER_PHONE'; END IF;

    PERFORM 1 FROM platform_settings WHERE category='messaging' AND setting_key='WHATSAPP_DEFAULT_PHONE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing platform_settings row: messaging/WHATSAPP_DEFAULT_PHONE'; END IF;
END$$;
