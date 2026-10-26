-- Optional document-merge data only. Existing users/companyname remain the
-- contact identity and sole registered organization-name source, respectively.
-- This adds no authority, package access, document or outbound notification.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.users'::regclass AND conname = 'users_client_profile_bounded_object'
    ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_client_profile_bounded_object
            CHECK (jsonb_typeof(client_profile) = 'object' AND octet_length(client_profile::text) <= 8192);
    END IF;
END $$;
