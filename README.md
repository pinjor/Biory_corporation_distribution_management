# BIORY Corporation distribution

Field sales, warehouse stock, orders, deliveries, collections and doctor visits. The browser talks only to a FastAPI service. Stock and money still move through the Postgres functions, with row level security on every read.

## Stack

- Frontend: React, TanStack Router
- API: Python, FastAPI, Argon2 passwords, JWT access tokens
- Data: Postgres 16 (ledger, FEFO, roles)
- Redis: refresh tokens, login rate limits, password-reset links
- Files: private receipts and deposit proofs on an API volume

## Run with Docker

```sh
copy .env.example .env
```

Replace every password and the JWT secret in `.env`. Production startup refuses the placeholders.

```sh
docker compose up --build
```

Open `http://localhost`. The first boot creates the database, the API role, and the bootstrap admin in `.env`. Products, territories, chemists and doctors from the company workbook are loaded into Postgres and served by the API.

Set `ALLOW_SIGNUP=false` when you do not want open registration. Password reset emails are sent only when `SMTP_HOST` is set. The bootstrap admin signs in with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, then creates staff and assigns roles.

## Local development

Start Postgres, Redis and the API from Docker, and run the UI on your machine:

```sh
docker compose up postgres redis backend
bun install
bun run dev
```

The dev server proxies `/api` to `http://127.0.0.1:8000`.

Regenerate `backend/sql/01_schema.sql` after a SQL migration change:

```sh
node backend/scripts/build_schema.mjs
```

API checks (from `backend/`, with the dev dependencies installed):

```sh
pip install -r requirements.txt pytest
pytest
```
