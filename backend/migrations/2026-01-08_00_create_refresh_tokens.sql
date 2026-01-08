-- Refresh tokens for long-lived sessions (e.g., biometric login)
-- Store only a hash of the token (never the raw token).

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    userid INTEGER NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    replaced_by_token_hash TEXT NULL,
    user_agent TEXT NULL,
    ip_address TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userid ON public.refresh_tokens(userid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON public.refresh_tokens(expires_at);
