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
END$$;
