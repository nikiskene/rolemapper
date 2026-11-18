# Rolemapper · Product and engineering brief

**Repository** `rolemapper` on GitHub  
**Data and authentication** Supabase  
**Deployment** Netlify  
**Runtime AI** None required for v1

## 1. What we are building

Rolemapper is a drag-and-drop map of the people around a company. A founder should be able to open it in a leadership meeting, see who does what, and decide what to hand off or hire for next. An investor should be able to understand in 30 seconds who builds, backs, advises and supports the company. The company can embed an approved, live view on its own website.

There are three connected questions in the product.

1. **Who is involved today?** Make the company map.
2. **What should I stop doing first?** Order the founder’s handoffs.
3. **What team would get us to our next goal, and what would it cost?** Compare future team scenarios.

Build the first release as a small, complete product. Use React, TypeScript and Vite as the default web stack, Supabase Postgres and Auth, and Netlify Functions for server-side work. Start with one live map per company and one owner who edits it. A user may own multiple companies, each with independent access and billing. Multi-editor collaboration can follow.

## 2. Company map

Use a founder-centered star with readable, fixed zones. Keep the positions stable across editor, public and investor views.

| Position | People and roles |
| --- | --- |
| Center | Founding lead |
| Left and right | Co-founders. Show each person’s remit clearly, including in equal partnerships. |
| Above | Investors and board |
| Upper left and right | Mentors, advisors and consultants |
| Below | Executive team, managers and team members |
| Lower left and right | Suppliers, vendors, legal and IP partners |

Represent an external organization with a partner card and optionally link its named contacts. Use one person record with multiple role placements. Example: the same person can be both a co-founder and the acting CFO. Support cards for open roles and future roles. Use the labels **Filled**, **Open** and **Later**. Each named role placement has one person, with separate placements when a role has multiple holders.

- Let the owner drag cards between zones and reorder within a zone. Use a predictable layout, with overflow handled by stacking and scrolling as needed. Provide a keyboard-accessible and touch-friendly “Move to” control. On narrow screens offer a grouped list with the same people and actions.
- Clicking a card opens a detail panel with role and remit, name, bio, LinkedIn, email and optional company or affiliation. Validate URLs, use plain text for user-entered bios and never render user-supplied HTML.
- Start with an empty map, prompt for the founder’s name, then guide the user through adding or moving the next card. Provide clear saving and error states. A refresh must restore the saved layout.
- Give the editor separate views for **Map**, **Handoffs** and **Scenarios**. Keep the map editor usable without setting up a public link or entering cost estimates.

## 3. Live public embed and investor view

A public profile and an iframe should show the same approved public projection. Provide public preview, copy link, copy embed code and unpublish actions. Suggested routes are `/p/:slug` and `/embed/:slug`. Supply a responsive-width iframe snippet with an accessible title and a usable default height. Inside it, visitors can open approved card details and switch to a compact list if needed.

Default cards and contact fields to private. Let the owner choose visible placements and fields. Treat the name, title and bio as explicit public choices, and require a separate opt-in for email. Preview exactly what a visitor will see. After initial publication, edits to approved visible fields and layout appear without replacing the embed code. A newly added card stays private until approved. Unpublishing withdraws the projection from subsequent requests and makes the embed show a neutral unavailable state. Keep public data responses uncached for launch. Refresh on re-entry and periodically while the embed is open so open views catch up. Use no sign-in or third-party cookies on the embed.

Provide a separate read-only investor link with its own approved cards and fields. Use a high-entropy token, store its hash, and support revocation and optional expiry. Treat it as a bearer link that can be forwarded. Keep it non-indexable, disable caching, and avoid leaking the token through referrers or telemetry. Use route-specific frame policies so the public embed works across origins and the app editor and investor view cannot be embedded. Handoffs, plan costs and invites remain private in v1. Return only approved data from the server. Test the response body as well as the rendered view.

## 4. Founder handoffs

Make responsibilities separate from job titles. One founder might own “qualify inbound leads,” “close strategic accounts” and “approve pricing exceptions.” Each can be handed off on its own timeline.

- Capture a responsibility, current owner, proposed next owner or open role, estimated founder hours per week, and optional target date and readiness notes.
- Give the founder one ordered list, with drag-to-reorder and accessible move controls. Start with manual ordering. Show weekly hours next to each item and how many hours are represented by the next few handoffs. Keep estimates editable.
- Allow **To plan**, **Ready**, and **Handed off**. On completion, confirm the new owner and record the handoff date. Completing a handoff updates responsibility ownership. The org map changes only when the owner updates a role placement.
- Show unassigned future ownership explicitly. A handoff can go to someone already on the team, an external partner, or a future hire. Preserve the record if a referenced person or role is archived and prompt for reassignment where needed.

## 5. Future team scenarios and costs

Let the owner duplicate the live map into an independent scenario, attach a growth goal, and add, remove or reassign planned roles without affecting the live map. Example goal: “Grow from 10 to 30 enterprise customers while preserving onboarding quality.” Compare a full-time Vienna customer success lead with a fractional lead plus a remote onboarding specialist.

For the first release, use editable estimates and a compact comparison of the current baseline and future scenarios. Ask the founder for a goal, target date and optional budget. Provide optional starter role suggestions from a small, editable set of templates tied to goals such as enterprise growth or delivery capacity. Treat suggestions as starting points the founder can adjust.

- Per planned role, store title, seniority, country, city or region, employment type, allocation, estimate period and currency. Support employees, fractional assignments and contractors.
- Accept a point estimate or low and high. Label the cost basis as base pay, total employer cost or contractor fee. Allow an explicit employer-cost estimate or burden assumption. Normalize to monthly and annual figures, including allocation where the estimate is for full-time work. Record the estimate source and date. Use decimals or integer minor units for money and validate ranges.
- Show baseline cost, planned total and incremental monthly cost when the inputs are comparable. For mixed currencies, show subtotals by currency unless a dated conversion rate has been supplied. Identify missing estimates and partial totals. An empty estimate is unknown.
- Later, add sourced benchmarks with low/median/high values by role, seniority, employment type and geography. Use the matching city when covered, and label regional or national fallbacks. Show data date, source, currency and cost basis. Keep the user override. Select and license a salary data source before presenting figures as market averages.

## 6. Pricing and billing

**Five people free. Pay to add a sixth.** Working price: **USD $10 per company per year**, configurable through the billing provider. Include the live website embed in the free plan. Use one paid tier for six or more people. Keep handoffs and scenarios available on both tiers for launch.

Count **unique active people placed on the live map**, including founders, investors, mentors and named supplier contacts. A person with several roles counts once. Unstaffed roles, archived people, hypothetical hires and organization cards without named individuals are excluded. Public visibility makes no difference to the count. Store normalized person references and encourage reusing an existing person when assigning a role.

Enforce the free cap in the database for every write path that can increase the count, including restoring an archived person or promoting a scenario hire to the live map. Serialize these writes per company in transactions to cover simultaneous requests. Show usage and offer upgrade when a sixth person would be added. Preserve the pending form during checkout and let the owner retry after activation.

Proposed billing integration: Stripe Checkout, customer portal and signed webhooks via Netlify Functions. Check company ownership before creating checkout or portal sessions. Use one Stripe customer and at most one active subscription per company, with idempotency controls. Persist subscription lifecycle and entitlement server-side. Verify signatures using the raw webhook body, handle duplicate and out-of-order events, and read current subscription state when needed. A successful browser redirect alone cannot grant access. Cancellation at period end keeps access through the eligible period. If a company lapses above five, preserve existing data and views, allow edits that keep or reduce the count, and block increases whenever the resulting count would exceed five and the subscription is inactive. Display this behavior clearly in billing settings.

## 7. Supabase data model and access

Use SQL migrations with foreign keys, constraints and indexes. Suggested entities:

| Entity | What it owns |
| --- | --- |
| `companies`, `company_members` | Workspace, slug, owner relationship and timezone |
| `people`, `organizations` | Company-scoped contact and partner details |
| `maps`, `placements` | One live map per company, placements with zone, rank, title, status and optional person or organization reference |
| `responsibilities` | Live handoff queue, owners, target dates, hours, status and order |
| `scenarios`, `scenario_roles` | Independent planning snapshots with goals, copied role details and editable cost assumptions |
| `map_publications`, `investor_links` | Publication controls, per-view allowlists, revoke and expiry state |
| `subscriptions`, `billing_events` | Company entitlement, provider identifiers and webhook processing state |

Enforce company membership with Row Level Security on all exposed tables. Use company-scoped foreign keys so a placement or handoff cannot point into another company. Protect entitlement fields from direct client writes. Keep anonymous users away from the underlying company tables. Have narrow, read-only public and investor endpoints build allowlisted projections from approved data. Rate-limit public endpoints and keep secret keys and share tokens out of logs. Use Supabase Auth with email sign-in and configure production and preview redirect URLs. Keep preview data and credentials separate from production.

## 8. Deployment and developer handoff

- Put this brief in the repo root. Include a `README.md`, committed migrations, seed data for one clearly fictional company, a lockfile, `.env.example` and `netlify.toml`.
- Document installation, local Supabase startup and migrations, running the UI and functions locally, seed access, and deployment. Netlify should build the Vite app and serve the `dist` folder. Configure function routing and SPA fallback so deep links work on direct visit and refresh.
- Browser configuration may include `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Put `SUPABASE_SECRET_KEY` where privileged server operations require it, along with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` and trusted app origin configuration, in the server environment. Never put secrets in `VITE_*` variables or commit live values.
- Make development runnable with local Supabase and Stripe test mode. Document which values the repo owner supplies for staging and production. Verify deployment against the chosen Netlify and Supabase projects when those are available.

## 9. Build order and release checks

1. **Private map.** Sign in, create a company, add and move cards, open details and refresh. Verify mobile and keyboard controls. Verify user A cannot read or mutate company B by calling the data layer directly.
2. **Sharing.** Embed a published map on a different origin while signed out. Edit a public title and confirm it updates. Verify private email, unpublished cards, handoffs and costs are absent from public and investor payloads. Unpublish the embed and revoke the investor link.
3. **Handoffs.** Assign several responsibilities to a founder, reorder them, and hand one to an existing teammate. Verify persistent ordering and ownership. Confirm the same founder still counts once.
4. **Scenarios.** Create two plans from the same live map and compare their cost ranges. Verify that edits leave the live map intact, and that unknown costs and mixed currencies are handled visibly.
5. **Billing and launch.** Verify the first five unique placements are allowed and the sixth is blocked across direct and concurrent writes. Verify checkout activation, duplicate webhook handling, archival and restoration, and lapsed subscriptions. Confirm the free embed works before and after upgrading. Run lint, type checks and the production build.

## 10. OpenAI decision

You can use Codex to build Rolemapper without provisioning an OpenAI API key for the app. The star map, handoff order, cost comparisons, permissions, live embed and billing are ordinary application logic. Salary benchmarks require reliable compensation data.

Add an OpenAI integration later only if a specific workflow proves useful, such as turning a founder’s written growth goal into draft roles and handoff suggestions. Run that as an opt-in server-side action with structured output and human approval before applying changes. Minimize the company data sent, keep contact details out by default, and let the app work when AI is unavailable.

## Implementation references

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Netlify function environment variables](https://docs.netlify.com/build/functions/environment-variables/)
- [Netlify SPA routing](https://docs.netlify.com/resources/troubleshooting/page-not-found-error-guide/)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
