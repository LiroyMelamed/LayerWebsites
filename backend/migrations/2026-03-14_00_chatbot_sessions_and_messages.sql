-- AI Chatbot: session and message tables
-- Supports public (unverified) and verified client chatbot sessions.

BEGIN;

-- ── chatbot_sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
    id            serial       PRIMARY KEY,
    phone         text         NULL,
    verified      boolean      NOT NULL DEFAULT false,
    user_id       integer      NULL REFERENCES public.users(userid) ON DELETE SET NULL,
    ip_address    text         NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    expires_at    timestamptz  NULL
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_phone
    ON public.chatbot_sessions (phone)
    WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_expires_at
    ON public.chatbot_sessions (expires_at)
    WHERE expires_at IS NOT NULL;

-- ── chatbot_messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_messages (
    id            serial       PRIMARY KEY,
    session_id    integer      NOT NULL REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
    role          text         NOT NULL DEFAULT 'user',   -- 'user' | 'assistant'
    message       text         NOT NULL,
    response      text         NULL,
    created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session_id
    ON public.chatbot_messages (session_id);

-- ── Grants (match existing pattern) ───────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_sessions TO current_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_messages TO current_user;
GRANT USAGE, SELECT ON SEQUENCE public.chatbot_sessions_id_seq TO current_user;
GRANT USAGE, SELECT ON SEQUENCE public.chatbot_messages_id_seq TO current_user;

COMMIT;
