# ANITTO

Next.js App Router version of MANITTO.

## Run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

Set these in `.env.local` for local dev or hosting provider env settings for deploy:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SESSION_SECRET=
ADMIN_EMAILS=
ADMIN_PROFILE_ID=
```

Never commit `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_SESSION_SECRET` must stay server-only.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

## Structure

- `app/`: Next.js app
- `app/api/admin/`: server-only admin auth and admin DB actions
- `app/legacy/`: adapted legacy UI bundle used by Next.js
- `html_legacy/`: original static HTML version, sanitized for archive
- `public/`: icons

## Security Notes

- Client-side admin password removed.
- Admin login uses a Supabase account plus HttpOnly cookie.
- Admin account is allowed by `profiles.is_admin = true` or `ADMIN_EMAILS`.
- Admin DB writes go through server API.
- CSP and common security headers set in `proxy.js`.
- Supabase service role key never goes to browser.

Supabase schema and RLS policies must be created in Supabase SQL Editor or migrations before production use.
