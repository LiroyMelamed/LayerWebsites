# AI Chatbot Architecture — MelamedLaw

## Overview

The AI Chatbot is a hybrid Retrieval-Augmented Generation (RAG) system that allows:

1. **Public users** — ask general legal questions (no authentication required)
2. **Verified clients** — ask questions about their personal case (OTP verification required)

The chatbot is accessible at `/chatbot` as a public page. It follows the existing system architecture: Express routes, PostgreSQL raw SQL, existing OTP/audit patterns, React frontend with i18next and SCSS.

---

## System Design

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│                                                          │
│  ChatBotPage ─> ChatWindow + ChatInput + OTP Modal       │
│       │                                                  │
│       ▼                                                  │
│  chatbotApi.js ─> Axios ─> /api/chatbot/*                │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend (Express)                        │
│                                                          │
│  chatbotRoutes.js                                        │
│    ├─ POST /api/chatbot/message      (rate limited)      │
│    ├─ POST /api/chatbot/request-otp  (rate limited)      │
│    ├─ POST /api/chatbot/verify-otp   (rate limited)      │
│    └─ GET  /api/chatbot/context      (rate limited)      │
│                                                          │
│  chatbotController.js                                    │
│    ├─ Session management (create/verify/expire)          │
│    ├─ OTP flow (reuses existing OTP system)              │
│    └─ Delegates to aiChatService                         │
│                                                          │
│  aiChatService.js                                        │
│    ├─ Intent detection (general vs. personal)            │
│    ├─ Prompt-injection sanitization                      │
│    ├─ RAG context retrieval (DB queries)                 │
│    ├─ System prompt composition                          │
│    └─ LLM API call (OpenAI-compatible)                   │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     ┌──────────────┐          ┌──────────────┐
     │  PostgreSQL   │          │   LLM API    │
     │  (RAG data)   │          │  (OpenAI)    │
     └──────────────┘          └──────────────┘
```

---

## Security Design

### Authentication

The chatbot uses a **session-based model** independent of the main JWT auth:

- Public users get an anonymous `chatbot_sessions` row (IP logged)
- Verified users go through the existing OTP system (HMAC-SHA256 hashed, 5-min expiry)
- Verified sessions expire after **30 minutes** (configurable via `CHATBOT_SESSION_TTL_MINUTES`)

### Rate Limiting

| Endpoint | Limit |
|---|---|
| `/api/chatbot/message` | 10 req/min per IP |
| `/api/chatbot/request-otp` | 5 req/min per IP |
| `/api/chatbot/verify-otp` | 5 req/min per IP |
| `/api/chatbot/context` | 10 req/min per IP |

Uses the existing `createRateLimitMiddleware` in-memory rate limiter.

### OTP Brute-Force Protection

Reuses the existing `otpBruteForce.js` module:
- Max 5 attempts in 15-minute sliding window
- 15-minute lockout after too many failures

### Audit Logging

All chatbot events are logged to the security audit log:

| Event Type | Trigger |
|---|---|
| `AI_CHATBOT_MESSAGE` | Every message sent/received |
| `CHATBOT_OTP_REQUEST` | OTP requested for verification |
| `CHATBOT_OTP_VERIFY_SUCCESS` | OTP verified successfully |
| `CHATBOT_OTP_VERIFY_FAIL` | OTP verification failed |
| `CHATBOT_OTP_VERIFY_BLOCKED` | Brute-force lockout triggered |
| `CHATBOT_OTP_REQUEST_UNKNOWN_USER` | Phone not found in system |

Logged fields: IP (direct), phone (masked to last 4 digits), user ID, session ID, user-agent.

### Input Sanitization

All user messages are checked against prompt-injection patterns before being sent to the LLM:

- SQL injection keywords (`SELECT * FROM`, `DROP TABLE`, `DELETE FROM`, `INSERT INTO`)
- Prompt manipulation (`ignore previous instructions`, `reveal system prompt`, `pretend you are`)
- Credential fishing (`API KEY`, `SECRET`, `.env`, `database schema`)

Detected attempts return a generic refusal — no details about what was blocked.

---

## AI Guardrails

The system prompt enforces strict behavioral rules:

1. Provides **general legal information only** — never binding legal advice
2. Responds in Hebrew by default (follows user's language)
3. Never fabricates case data — only uses injected system context
4. Requires phone verification for personal case queries
5. Refuses to reveal system prompts, API keys, or internal architecture
6. Recommends contacting the firm when unsure

---

## RAG Architecture

### How Context is Injected

When a verified user sends a message:

1. **Intent detected** — is the user asking about their personal case?
2. **Context retrieved** — SQL queries fetch relevant data:
   - User's cases (name, status, type, last update)
   - Recent notifications (title, message, date)
   - Signing files (if case-specific query)
3. **Context formatted** — structured Hebrew text appended to system prompt
4. **LLM called** — receives system prompt + context + conversation history + user message
5. **Response returned** — the LLM's answer is grounded in real data

### RAG Data Sources

| Source | Table | Fields |
|---|---|---|
| Cases | `cases`, `case_users`, `casetypes` | name, status, type, dates |
| Notifications | `usernotifications` | title, message, date |
| Signing files | `signingfiles` | filename, status, dates |

Access is always scoped to the verified user via the `case_users` junction table.

---

## Verification Flow

```
User opens /chatbot
     │
     ▼
Asks general question ────> AI responds (general knowledge only)
     │
     ▼
Asks about "my case"
     │
     ▼
System detects personal intent
     │
     ▼
Shows verification modal
     │
     ▼
User enters phone number
     │
     ▼
POST /api/chatbot/request-otp
     │
     ▼
OTP sent via Smoove SMS
     │
     ▼
User enters 6-digit code
     │
     ▼
POST /api/chatbot/verify-otp
     │
     ▼
Session upgraded to verified (30-min TTL)
     │
     ▼
User can now ask case-specific questions (RAG context injected)
```

---

## Database Schema

### chatbot_sessions

| Column | Type | Description |
|---|---|---|
| id | serial PK | Session identifier |
| phone | text | Phone number (null for public) |
| verified | boolean | Whether OTP-verified |
| user_id | integer FK | Links to users.userid |
| ip_address | text | Client IP |
| created_at | timestamptz | Session start |
| expires_at | timestamptz | Session expiry (null for public) |

### chatbot_messages

| Column | Type | Description |
|---|---|---|
| id | serial PK | Message identifier |
| session_id | integer FK | Links to chatbot_sessions.id |
| role | text | 'user' or 'assistant' |
| message | text | Message content |
| response | text | AI response (for assistant rows) |
| created_at | timestamptz | Timestamp |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHATBOT_LLM_API_KEY` | (none) | OpenAI API key |
| `CHATBOT_LLM_API_URL` | `https://api.openai.com/v1/chat/completions` | LLM endpoint |
| `CHATBOT_LLM_MODEL` | `gpt-4o-mini` | Model name |
| `CHATBOT_LLM_MAX_TOKENS` | `1024` | Max response tokens |
| `CHATBOT_LLM_TEMPERATURE` | `0.4` | Response creativity |
| `CHATBOT_SESSION_TTL_MINUTES` | `30` | Verified session TTL |

---

## File Map

### Backend
- `controllers/chatbotController.js` — request handlers (message, OTP, context)
- `services/aiChatService.js` — RAG orchestration, LLM call, intent detection, injection filtering
- `routes/chatbotRoutes.js` — route definitions with rate limiting
- `migrations/2026-03-14_00_chatbot_sessions_and_messages.sql` — database schema
- `tests/chatbot.test.js` — unit and integration tests

### Frontend
- `screens/chatbot/ChatBotPage.jsx` — main page with OTP modal
- `screens/chatbot/ChatBotPage.scss` — page styles
- `components/chatbot/ChatWindow.jsx` — message list with typing indicator
- `components/chatbot/ChatWindow.scss` — window styles
- `components/chatbot/ChatMessage.jsx` — single message bubble
- `components/chatbot/ChatMessage.scss` — message styles
- `components/chatbot/ChatInput.jsx` — text input with send button
- `components/chatbot/ChatInput.scss` — input styles
- `api/chatbotApi.js` — Axios API wrapper

### Configuration
- `featureFlags.js` — `AI_CHATBOT_ENABLED` flag
- `i18n/locales/he.json` — Hebrew translations (chatbot section)
- `i18n/locales/en.json` — English translations (chatbot section)
- `i18n/locales/ar.json` — Arabic translations (chatbot section)
- `utils/errors.he.js` — Hebrew error messages (CHATBOT_SESSION_EXPIRED, CHATBOT_UNAVAILABLE)
