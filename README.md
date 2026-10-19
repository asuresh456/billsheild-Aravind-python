# BillShield Python Edition

A separate Python backend edition of BillShield. It preserves the existing browser UI and moves the server-side application routes to **FastAPI/Python**. The browser still uses HTML, CSS, and a small amount of JavaScript because web browsers execute client-side code; Gemini and Supabase credentials and all account/session logic stay on the Python server.

## Features

- Upload a PDF, JPG, PNG, or WebP statement (up to 3 MB) and ask a question.
- Send the uploaded file and question to Gemini for bill reading and explanation.
- Keep Gemini and Supabase secret keys server-side.
- Provide optional app-managed email/password accounts. Passwords are stored as salted scrypt hashes; signup sends no email.
- Save signed-in conversation text and stated context in the existing Supabase Postgres tables. Guest conversations stay in the browser session and are not saved.
- Uploaded bill files are temporary and are not stored by BillShield.

## Run locally

Requires Python 3.12+ and the Vercel CLI for the closest match to production. Install dependencies and provide the values in `.env.example` through your environment or a local `.env` file:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with server-side keys. Never commit .env.
uvicorn app:app --reload
```

Open `http://127.0.0.1:8000`. Alternatively, after linking this project to a Vercel project and configuring its development environment variables, run `vercel dev`.

The interactive API reference is available at `/api/docs` during local development.

## Environment variables

- `GEMINI_API_KEY` — server-only Gemini key.
- `GEMINI_MODEL` — optional; defaults to `gemini-3.5-flash-lite`.
- `SUPABASE_URL` — URL of the existing Supabase project.
- `SUPABASE_SECRET_KEY` — server-only Supabase secret key (legacy `SUPABASE_SERVICE_ROLE_KEY` is also recognized for compatibility).
- `NODE_ENV=production` — enables secure session cookies in production (Vercel also provides `x-forwarded-proto`).

Never use a `NEXT_PUBLIC_` prefix for secrets and never commit real key values.

## Database

The app-managed account/history schema is in `supabase/migrations/20261019182000_billshield_app_accounts.sql`. Apply it once to the Supabase project before using accounts. This app does not use Supabase Auth, so signup does not send email. Password recovery is not enabled. The Python edition points to the same tables as the JavaScript app; existing account credentials and history therefore use the same database, while each hostname has its own browser session cookie.

## Deploy to Vercel as a separate project

Vercel detects the FastAPI `app` in this repository and serves the static assets under `public/`. Create a **new Vercel project** from this repository so it does not replace the live JavaScript project, then add the four environment variables above for the environments you need. Check Vercel's current Python runtime documentation for supported versions, limits, and deployment requirements before relying on it for a public demo.

This project deliberately has no `.vercel/project.json` so it cannot accidentally deploy over `billshiledhack` when run from the wrong directory.

## Data and safety notes

- Guest reviews are not saved; signed-in chat text is saved to the account.
- The uploaded image/PDF is sent to Gemini for the request and is not persisted by this app.
- A returned explanation is not proof of a billing error. Confirm extracted numbers against the statement and card terms.
- Free-tier AI services may have their own data-use terms. Use synthetic or fully redacted statements for demos.
- Configure rate limits and usage budgets before sharing publicly.

## Links

- Current production JavaScript app: https://billshiledhack.vercel.app/
- Current JavaScript repository: https://github.com/asuresh456/billsheild-Aravind
