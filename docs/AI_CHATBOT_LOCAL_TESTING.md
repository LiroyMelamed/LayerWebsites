# AI Chatbot — Local Testing Guide

This guide explains how to run and test the AI Chatbot feature locally.

---

## Prerequisites

- **Node.js** v18+ (v24 tested)
- **PostgreSQL** database (Neon cloud already configured in `.env`)
- **OpenAI API key** (only needed for real AI responses; tests use mocks)

---

## 1. Backend Setup

```bash
cd backend
npm install
```

### Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.chatbot.local.example .env.chatbot.local
```

Or add these variables to your existing `.env`:

```
CHATBOT_LLM_API_KEY=your-openai-key
CHATBOT_LLM_MODEL=gpt-4o-mini
CHATBOT_SESSION_TTL_MINUTES=30
AI_CHATBOT_ENABLED=true
NODE_ENV=development
```

### Run Migration

```bash
node scripts/run-chatbot-migration.js
```

### Seed Test Data

```bash
npm run chatbot:seed
```

This creates:
- **Test user**: phone `0500000000`, name "לקוח בדיקה"
- **Test case**: "תיק בדיקת צ׳אטבוט", type "אזרחי", stage 3
- **Test notification**: next hearing date
- **Timeline entry**: court approval

### Start Backend

```bash
npm start
```

The server runs on `http://localhost:5000` (or your configured `PORT`).

---

## 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```

Opens `http://localhost:3000`.

Navigate to: **http://localhost:3000/chatbot**

---

## 3. Testing OTP Locally

When `NODE_ENV=development`, OTP codes are logged to the backend console:

```
[CHATBOT OTP DEV MODE]
phone: 0500000000
code: 482193
```

### Test Flow:

1. Open `http://localhost:3000/chatbot`
2. Type a personal question like "מה קורה עם התיק שלי?"
3. The chatbot responds asking for verification
4. Click the verification button
5. Enter phone: `0500000000`
6. Check the **backend terminal** for the OTP code
7. Enter the code in the UI
8. You should see "✓ מאומת" badge
9. Ask again about your case — now RAG context is injected

> **Tip**: If `0500000000` is listed in `DEMO_OTP_PHONES`, the code is always `123456`.

---

## 4. Running Tests

### Unit Tests (no DB required)

```bash
cd backend
npm test
```

Runs all `tests/*.test.js` files, including:
- `chatbot.test.js` — Unit tests (injection detection, intent detection, context formatting)

### Integration Tests (DB required)

```bash
cd backend
NODE_ENV=test node --test tests/chatbot.integration.test.js
```

Tests the full HTTP flow:
- Message sending and session creation
- OTP request/verify flow
- Personal question verification requirement
- Injection blocking
- RAG context injection
- Rate limiting enforcement

### Full Test Suite (seed + all tests)

```bash
cd backend
npm run chatbot:test
```

This runs `chatbot:seed` first, then all tests.

---

## 5. Testing RAG (Retrieval-Augmented Generation)

Once verified with phone `0500000000`, the chatbot retrieves:
- User's cases from `cases` + `case_users`
- Recent notifications from `usernotifications`
- Signing files from `signingfiles` (if any)

This data is injected into the LLM system prompt under "הקשר מערכת".

### Verify RAG is working:

1. Complete OTP verification
2. Ask: "מה המצב של התיק שלי?"
3. The response should reference the seeded case data
4. In the **Dev Panel** (bottom of screen), click "Refresh Context" to see the session state

### Without OpenAI key:

If `CHATBOT_LLM_API_KEY` is not set, the chatbot returns:
> "מצטער, שירות הצ׳אט אינו מוגדר כרגע. נסה שוב מאוחר יותר."

Tests mock the LLM API, so they work without a real key.

---

## 6. Dev Panel

In development mode (`NODE_ENV=development`), a debug panel appears at the bottom of the chatbot page.

It shows:
- **Session ID**: Current chatbot session
- **Verified**: Whether OTP verification succeeded
- **Context API (ms)**: Response time for context endpoint
- **Last Context**: Raw JSON from the context API
- **AI Probe**: Send a test message and measure round-trip time

---

## 7. Rate Limiting

The chatbot has separate rate limiters:
- **Messages**: 10 requests/minute per IP
- **OTP endpoints**: 5 requests/minute per IP

To test:
```bash
# Send 12 rapid requests — the last ones should return 429
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:5000/api/chatbot/message \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}'
done
```

The integration test also verifies rate limiting automatically.

---

## 8. Troubleshooting

### `.env` line endings
If you see `getaddrinfo ENOTFOUND`, your `.env` file may have Windows-style `\r\n` line endings. Fix with:
```bash
sed -i '' 's/\r$//' backend/.env
```

### Database connection
Verify DB connectivity:
```bash
curl http://localhost:5000/health
```

### OTP not appearing in console
Make sure `NODE_ENV=development` is set in your `.env`.

### Chatbot returns "שירות הצ׳אט אינו מוגדר"
Set `CHATBOT_LLM_API_KEY` in your `.env` to a valid OpenAI key.

---

## File Map

| File | Purpose |
|------|---------|
| `backend/.env.chatbot.local.example` | Environment variable template |
| `backend/scripts/seedChatbotTestData.js` | Seed test data |
| `backend/scripts/run-chatbot-migration.js` | Run DB migration |
| `backend/tests/chatbot.test.js` | Unit tests |
| `backend/tests/chatbot.integration.test.js` | Integration tests |
| `backend/controllers/chatbotController.js` | HTTP endpoints |
| `backend/services/aiChatService.js` | RAG + LLM orchestration |
| `backend/routes/chatbotRoutes.js` | Route definitions |
| `frontend/src/screens/chatbot/ChatBotPage.jsx` | Main chatbot UI |
| `frontend/src/components/chatbot/ChatBotDevPanel.jsx` | Dev debug panel |
| `frontend/src/api/chatbotApi.js` | API client |
