# ExitIQ

ExitIQ is atares's exit readiness self-assessment. It's built to the *ExitIQ Product and Implementation Brief* v1.0 (4 November 2026, in `docs/`) and the landing and assessment designs in `docs/design/`.

The app is React + Vite + TypeScript on Supabase (project `elpjwoujqzskgydytvob`), deployed as a static SPA (Vercel config included).

## What is implemented (Release 1 scope from brief section 22)

- **Staged journey.** Context (3 steps) → configuration summary → 8 discovery screens → initial picture → deep assessment in 6 chapters → action plan. Progress is saved after every answer, and you can resume at any stage.
- **Context and routing.** All section 3 fields are covered, including `UNKNOWN`. The profile must be confirmed explicitly; "Not decided yet" keeps scoring pending. Seller tax residence is asked, never inferred. The 14 routes from section 4 are evaluated deterministically, and an unknown trigger keeps its module *pending*: it stays in the denominator and blocks a "complete" result.
- **Catalogue.** 55 registered controls (37 CORE + 18 conditional) with anchors, local weights, contributors, dependencies and context wording (Q07, Q12, Q32).
- **Scoring (section 7).** Effective weights, answer coverage, an answered-only index (null, never 0, when nothing is answered), missing-answer bounds, a separate evidence support figure, the 80% / 50%-per-domain display rule, and "Indicative, incomplete" vs "Complete". There is no overall score, valuation or multiple.
- **Answer states (section 18).** Substantive, Unknown, Needs internal confirmation, Needs adviser review, Prefer not to answer, N/A requested (removes no weight until confirmed), and Conflicted. When a context edit turns a module off, its answers go *inactive* and are never deleted. If the module comes back, those answers need reconfirmation.
- **Risks and priorities (section 8).** Rules R01–R07, plus liquidity review and unresolved applicability. Critical status comes only from a confirmed predicate; UNKNOWN only ever creates "Needs review". Tasks are ordered confirmed-critical → unresolved-critical → gaps, then by timing and `e_q × (100 − a_q)/100`. Each task carries its source question, reason, domain action template, suggested owner, timing, dependencies and evidence required.
- **Action plan (section 19).** Context chips, three dimension cards, risk status, up to 3 supported strengths linked to answer IDs, a filterable task list with per-task status, and a tax section split into company, seller and cross-border. It also offers print to PDF, a CSV task export, an optional "Discuss with atares" link, and delete.
- **Analytics (section 20).** Stage views, starts, theme completion, route changes, saves, resumes, result views, exports and contact requests. Events carry no answer content.
- **Landing page.** Ported from *ExitIQ Landing v2* with EN/DE copy and the interactive 3-question preview.

## Supabase setup (one time, in the dashboard / CLI)

The Supabase connector used to build this had no access to the project, so **the migrations have not been applied yet**. To set up:

1. **Apply the schema**:

   ```bash
   npx supabase link --project-ref elpjwoujqzskgydytvob
   ```

   ```bash
   npx supabase db push
   ```

   Alternatively, paste the files in `supabase/migrations/` into the SQL editor, in filename order.
2. **Enable anonymous sign-ins**: Dashboard → Authentication → Sign In / Providers → *Allow anonymous sign-ins*. Each visitor then gets a real `auth.uid()`, and RLS enforces owner-only access. Without it, the app still works, but only in the browser ("Saved in this browser").
3. **Turn on abuse protection** for anonymous sign-ins: Authentication → Attack Protection → CAPTCHA with **Cloudflare Turnstile**, using the Turnstile *secret* key. Then set the Turnstile *site* key as `VITE_TURNSTILE_SITE_KEY` on Vercel (and in `.env.local`), and redeploy. Without the site key, Supabase rejects every anonymous sign-in, and the app quietly falls back to saving in the browser only. In Cloudflare, the widget's allowed hostnames must include the production domain (and `localhost` for development).
4. **URL configuration**: Authentication → URL Configuration. Set the Site URL to the production domain and add `https://<domain>/assessment` as a redirect URL. "Save and return" uses these when it links an email to the anonymous user.
5. **Check the advisors**: Dashboard → Advisors (security and performance) after the migration.

## Database

| Table | Purpose | Client access (RLS) |
| --- | --- | --- |
| `question_definitions`, `profile_weights` | Versioned catalogue (generated from `src/model/catalogue.ts`) | read for everyone |
| `assessments` | Context, profile, modules, versions, stage | owner only |
| `answers` | **Append-only** answer history (`previous_answer_id`); `current_answers` view = latest per question | owner reads and appends; no update/delete |
| `evidence_refs` | Dated reference, responsible role, review status, access scope | owner adds; can't self-certify `reviewed` |
| `tasks` | Action plan with user status / agreed due date | owner |
| `result_snapshots` | Versioned deterministic result objects | owner reads and appends |
| `analytics_events` | Minimal events | insert only |

Clients can't write the states that need an authorised reviewer: confirmed N/A, reviewed evidence and contradiction resolution. The reviewer role and seller-private access scopes are part of Release 2.

## Development

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm test` | Model acceptance tests (brief section 21) and the catalogue-seed drift check |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build into `dist/` |
| `npm run db:test` | Applies all migrations to a throwaway local Postgres (with a minimal Supabase stub) and runs the RLS checks in `supabase/tests/rls.test.sql` |
| `npm run gen:catalogue-sql` | Regenerates the catalogue seed migration after editing `src/model/catalogue.ts` |

Environment variables (`.env.local`): `VITE_TURNSTILE_SITE_KEY` (required while CAPTCHA protection is on), plus the optional `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is public by design, and the defaults point at the ExitIQ project. Never put a secret or service-role key in a `VITE_` variable.

## Code map

- `src/model/`: the pure, deterministic engine. `catalogue.ts` holds controls, weights, chapters and action templates; `routing.ts`, `scoring.ts` and `plan.ts` cover risks, tasks, observations and the result snapshot. The recalculation order follows section 18. No language model touches scores, routes or risk status.
- `src/lib/store.ts`: assessment state, local persistence and the remote mirroring calls.
- `src/lib/remote.ts`: Supabase reads and writes, anonymous sign-in and analytics.
- `src/views/`: the landing page and the assessment screens.
- `supabase/migrations/`: schema, RLS and the generated catalogue seed.

## Open items before launch

- **Content sign-off** (brief section 22). The 55 anchors, domain matrices, critical predicates and task wording are *proposed v1 parameters*. The M&A, tax and legal owners need to approve them before production scoring.
- **Imprint and privacy.** The footer links point to atares.team. The privacy notice must match this implementation: anonymous auth session, Supabase storage, no AI processing, and deletion from the action plan.
- **German assessment.** The landing page is EN/DE; the assessment is English only.
- **Release 2.** Scoped contributor invitations, a reviewer role (confirm N/A, review evidence, resolve conflicts), and seller-private tax areas. The UI says so honestly and offers a CSV task export in the meantime.
- **Narrative report.** Not generated in this version. The deterministic result is the report. Any later narrative must be generated from `ResultSnapshot`, which comes from `buildResult`, under the section 20 rules.
