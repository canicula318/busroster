# サミットライン（補習校バス申込）

Weekly bus signup for NJ Japanese Weekend School families. Replaces the Glide app.

- **App:** https://canicula318.github.io/busroster/ (built with Vite + React, deployed by GitHub Actions)
- **Database & sign-in:** Supabase project `busroster` (Postgres, email sign-in links, row-level security)
- **Email:** sign-in emails are sent by Resend from `busroster@mail.canicula.me`

## Weekly process

1. Every active student rides **both ways** by default. A family only sends a **変更連絡** when that week is different (お休み / 行きのみ / 帰りのみ, or a one-time guest with their own trip).
2. The parent on duty (当番) opens **名簿**, checks the week's changes and counts, and taps **LINEで送る** to post the message to the LINE group.
3. Any mistakes are corrected in LINE.

## Who can do what

| | Parents | Admins |
|---|---|---|
| Sign in | Only with an email listed for their family | Any email in the `admins` table |
| Change notices | Their own family's, for today or later | Everyone's, any date |
| Weekly roster (names, stop, trip, comments) | Yes, read-only (for the 当番) | Yes |
| Emails, phone numbers, duty sheet, Families tab | No | Yes |
| Fares | View | Edit in Supabase Table Editor |

These rules are enforced by the database (see `supabase/migrations/0001_initial_schema.sql`), not just hidden in the UI.

## Common admin tasks

- **Add a family / student / second parent email:** Families tab in the app.
- **Weekly headcount & CSV:** Roster tab.
- **Change fares or Square links:** Supabase → Table Editor → `fares`.
- **Add another admin:** Supabase → Table Editor → `admins` → insert their email (lowercase).

## Development

```bash
npm install
npm run dev      # http://localhost:5173/busroster/
npm run build
```

Pushing to `main` deploys automatically. The Supabase URL and publishable key in `src/supabase.ts` are public by design.

**Never commit exported roster data** (CSV files are git-ignored): it contains children's names and phone numbers.

## Keep-alive

`.github/workflows/keepalive.yml` pings Supabase every 3 days so the free project doesn't pause during school breaks. GitHub disables scheduled workflows in repos with no activity for 60 days; if that happens, re-enable it under the Actions tab.
