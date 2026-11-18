# Rolemapper

A private workspace for mapping the people and roles around a company. This checkout implements the private map milestone in the [product brief](ROLEMAPPER_BRIEF.md). Sharing, handoffs, scenarios and billing are subsequent milestones.

## Run locally

Install Node 22 and the Supabase CLI, and start a Docker daemon. From this checkout:

```sh
npm ci
supabase start
supabase db reset
cp .env.example .env.local
```

Use the local API URL and publishable key from `supabase status` in `.env.local` (the local anon key is also accepted as a legacy publishable credential). Then run `npm run dev` and visit http://localhost:5173. Sign up with a local development email and create a company, or run `npm run seed` and sign in with the fictional account printed by that command. Email confirmation is disabled only in the checked-in local Supabase configuration. The seed signs in as the sample owner and uses the same RPCs as the editor; it does not insert data with a privileged key. A local database reset clears the sample and test accounts.

The map groups cards around a fixed center. Drag a card onto another card to insert it before that card, or drop it on a zone to append. The same operations are available through **Move to…** on desktop and touch screens. Narrow screens show the grouped list. Use a saved person record to reuse contact details across placements.

## Verify in release order

- `npm test` applies the production migration in embedded Postgres with Supabase-style identity claims and roles. It checks both tenants, scoped references, anonymous denial, rollback and saved ordering. This test requires no credentials.
- `npm run test:api` uses two real local Supabase Auth accounts and direct REST/RPC calls with their sessions plus an anonymous client. Run it against the disposable local database after applying migrations.
- With local Supabase running, sign in, add a founding lead, open card details, and drag two cards across and within zones. Reload and confirm the order. Open at a narrow viewport, then use only the keyboard to open **Move to…**, select a destination and position, and save. Reload again and confirm the change. Complete this and the authenticated API check before implementing sharing.
- `npm run lint` and `npm run build` check code and generate `dist/`.

## Deploy the private milestone

Use separate Supabase projects and publishable keys for staging and production. Apply the migration to the selected project, configure email confirmation and SMTP as needed, and set each allowed app origin in Supabase Auth's URL configuration. Use explicit preview URLs for controlled previews. Link the repository to Netlify and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for each environment. The Netlify config builds the app and serves SPA routes with framing disabled. The private map uses Supabase directly and needs no Netlify Functions or privileged browser credentials.

The company record holds the one-owner relationship. The database creates its single map atomically, restricts every table to the authenticated owner, and uses composite references to keep people and organizations within the placement's company. Card and move RPCs run with the caller's privileges; the one privileged bootstrap RPC derives ownership exclusively from the authenticated user ID.
