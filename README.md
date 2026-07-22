# SVPG Manager — Multi-PG Operations System

A simple, free, mobile-first web app to manage one or more PGs:
- **Multi-PG, multi-PG staff** — admin sees every property; a staff/warden login can be assigned to one PG (locked) or several (gets a property switcher, same as admin), each visually distinguished by its own color accent in the header so a wrong-PG entry mistake is obvious at a glance
- **Rooms & facilities** — floor-by-floor layout, bed-by-bed occupancy, a standard facility checklist per room (bed, mattress, fan, geyser, attached bathroom, etc.) with condition tracking, and a maintenance flag for rooms that need attention
- **Residents** — full hosteller profile (phone, Aadhaar, emergency contact, agreement signed, police verification status), with automatic refund-eligibility calculation based on notice period. Vacate flow is fully reversible: **Cancel Vacate Notice** for someone who gave notice but is staying, **Undo Vacate** (with a bed picker) for someone already fully marked vacated
- **Per-bed custom rent & advance** — override either amount for one specific bed/resident (a negotiated rate), independent of the room's standard rate; every screen (Rent, Residents, Dashboard, Reports, check-in receipts) reflects the override automatically
- **Rent collection, with mid-month pro-ration** — month-by-month, who's paid/pending/overdue. A resident joining mid-month is billed only for days actually stayed (not a full month), with a per-resident choice for when that first partial month is due: the regular cycle (5th, or month-end if that's already passed) or their own join date
- **Expenses & Income** — Expenses covers everything that goes out (groceries, milk, electricity, water, Wi-Fi, staff salary, landlord rent, maintenance, housekeeping, etc., fully categorized); a separate **Income** log sits alongside it for PGs where rent is collected in bulk rather than tracked per-resident (e.g. a leased-out property)
- **Dashboard** — occupancy, this month's money in vs out, category breakdown of every expense, rooms needing maintenance, and a priority list of who's vacating soonest with their refund eligibility
- **Rent Due Soon & Overdue** (Menu tab) — a short, scannable list of only what actually needs attention right now (overdue, partial, or pending with a due date in the next 5 days), plus an opt-in browser notification that fires once a day per PG when the app is opened if something's newly due
- **Check-in receipts** — a permanent, locked snapshot taken at move-in: room condition, the resident's actual agreed rent/deposit (respecting any custom override), and full house rules including a property-damage/wastage liability clause. Once generated it cannot be edited or deleted by anyone — generate a fresh one instead if something needs correcting
- **ID document uploads** — Aadhaar and PAN photos, compressed automatically before upload
- **Staff corrections workflow** — staff can never delete a payment or expense outright; they flag it with a reason and the admin reviews, fixes, or dismisses it. Nothing disappears silently
- **Flexible room sharing (1-3 people)** — convert any room between single/double/triple sharing as residents negotiate, with protection against shrinking a room while someone still occupies a bed that would be removed
- **Fixed Charges reference list** — save standard recurring rates (landlord rent, Wi-Fi, etc.) so the current price is always one tap away, with one tap to log it as a real dated expense

Runs **completely free** on Cloudflare Pages + Cloudflare D1. No monthly hosting bill.

---

## How this is built

- **Frontend**: Plain HTML/CSS/JavaScript — no build tools
- **Backend**: Cloudflare Pages Functions (small serverless functions)
- **Database**: Cloudflare D1 — one shared SQL database, every table scoped by `pg_id` so properties never mix
- **Hosting**: Cloudflare Pages — free `.pages.dev` address, custom domain optional

Everything fits inside Cloudflare's free tier even with several PGs at this scale.

---

## Part 1 — Deploying it (GitHub + Cloudflare, step by step)

This is the most reliable, repeatable way to deploy — and it's the same method whether this is your first deploy or you're updating later. Every future change you make just needs `git push`.

You'll need:
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A free [GitHub account](https://github.com/signup)
- A computer (one-time setup is easier here; daily use will be on your phone)

### Step 1 — Put the project on GitHub

1. Go to [github.com/new](https://github.com/new) → create a **private** repository, e.g. `svpg-manager`.
2. On your computer, open a terminal in this project folder:
   ```
   git init
   git add .
   git commit -m "Initial SVPG Manager app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/svpg-manager.git
   git push -u origin main
   ```

### Step 2 — Create the database

1. Install Wrangler (Cloudflare's CLI):
   ```
   npm install -g wrangler
   ```
2. Log in:
   ```
   wrangler login
   ```
3. Create the database:
   ```
   wrangler d1 create svpg-manager-db
   ```
4. Copy the `database_id` it prints, and paste it into `wrangler.toml` (replacing `REPLACE_WITH_YOUR_DATABASE_ID`).
5. Push that change:
   ```
   git add wrangler.toml
   git commit -m "Add real database id"
   git push
   ```

### Step 3 — Load your room structure into the database

```
wrangler d1 migrations apply svpg-manager-db --remote
```
This sets up the base schema and your first PG's room/facility structure.

> **Already deployed an earlier version of this app?** Just run the same command again — Wrangler tracks which migrations have already run and only applies the new ones (past examples: corrections workflow, check-in receipts, fixed charges, per-bed custom rent/advance, multi-PG staff, income tracking). Your existing rooms, residents, and payment history are untouched. See `migrations/*.sql` for the full list of what each one adds — every file is numbered in the order it was applied.

### Step 4 — Connect Cloudflare Pages to your GitHub repo

1. [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create Application** → **Pages** → **Connect to Git**.
2. Pick your `svpg-manager` repo.
3. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave blank)
   - **Build output directory**: `public`
4. **Save and Deploy**.

### Step 5 — Bind the database

1. Your Pages project → **Settings** → **Functions** → **D1 database bindings** → **Add binding**.
2. Variable name: `DB` (exact, capital letters). D1 database: `svpg-manager-db`.
3. Save, then **Retry deployment** so the binding takes effect.

### Step 6 — Create your admin login

1. Visit your live URL (Cloudflare shows you `https://svpg-manager-xxx.pages.dev` after deploy).
2. You'll see **"Create your admin login and your first PG"** automatically — this only appears once.
3. Fill in your details and the PG name, then log in.

That's it. This setup screen disables itself permanently after the first account is created.

---

## About the ChatGPT instructions you mentioned

If you paste them in, I'll check them line by line against this actual project (file structure, wrangler config, database commands) before you follow any of them — generic AI-written deployment steps sometimes assume a different project layout, and I'd rather confirm than have you hit a wall I could've caught first.

---

## Part 2 — Using the app

### Dashboard
At a glance: occupancy, this month's rent collected vs pending, every expense category broken down (so you can see at a glance how much went to groceries vs landlord rent vs electricity), rooms flagged for maintenance, and everyone who's given notice — sorted soonest-first — each with an automatic **refund eligible / not eligible** badge based on whether they gave 30+ days notice.

### Switching PGs
Tap the property name at the top of the screen. Admin sees every PG; a staff/warden login sees this too if (and only if) they're assigned to more than one PG — each one tap away, color-coded so it's obvious which property you're currently in. **+ Add Another PG** (admin only) brings a new property online. A login locked to just one PG doesn't see this at all — nothing to switch between.

### Rooms
Floor-by-floor grid, color-coded by occupancy. A small red dot means the room needs maintenance. Tap any room to:
- See bed-by-bed occupancy and assign new residents to vacant beds
- Mark the room for maintenance with a note (clears the dashboard alert once unchecked)
- Review and update the facility checklist (12 standard items per room) — mark anything damaged or missing during check-in/checkout inspections
- **Edit Rent / Sharing Type** — convert any room between Single, Double, or Triple sharing as residents negotiate. Growing a room adds new beds and extends the facility checklist automatically; shrinking is blocked if it would remove a bed that's currently occupied (move or vacate that resident first).

### Residents
Filter by Active / Vacating / Vacated. Full profile includes Aadhaar number + photo, PAN number + photo, agreement status, police verification. Photos are compressed automatically when uploaded so they stay small.

- **Custom rent / custom advance** — set a negotiated rate for one specific bed, on either Add or Edit Resident. Leave blank to use the room's standard rate. Every screen (Rent, Residents, Dashboard, Reports, check-in receipt) reflects whichever applies.
- **First Month Rent Due** (Add/Edit Resident) — for someone joining mid-month, choose whether their first (pro-rated) month is due on the regular cycle (5th, or month-end if that's already passed) or on their own join date. Only affects that first partial month; every month after is the normal cycle regardless.
- **Record Vacate Notice** logs the date — the app then automatically tells you whether they're eligible for their advance refund based on the 30-day rule, no manual calculation needed.
- **Cancel Vacate Notice** — for someone who gave notice but changed their mind and is staying; clears the notice/planned-vacate dates, no bed picker needed since they never lost their bed.
- **Undo Vacate** — for someone already fully marked vacated who's coming back; opens a bed picker (their old bed may no longer be free) and a rejoin date, so rent tracking starts fresh from their return instead of retroactively billing the months they were actually gone.

**Check-in Receipt** — from a resident's profile, generate a permanent receipt that locks in: the room's facility condition at that exact moment, their actual agreed rent/deposit (custom override if set, otherwise the room's standard rate), and the full house rules including a property-damage/wastage liability clause. Once generated, this receipt can never be edited or deleted by the app — if something about the original needs correcting, generate a new one instead; the old one stays on file exactly as it was. Use the **Print / Save as PDF** button to hand the resident a physical or digital copy.

### Rent
Month-by-month view, auto-generates each resident's due amount (pro-rated for a mid-month join, full rent every month after), flags overdue, one-tap to collect a payment. Room view and Resident view show the same underlying figures — they can't disagree, both are computed by the same shared server-side logic.

### Expenses & Income
**Expenses** is your complete money-out picture, categorized: Groceries (food ingredients), Milk, Electricity, Water, Wi-Fi, Rent paid to Landlord (what *you* pay out, kept completely separate from resident rent income), Staff Salary, Housekeeping & Cleaning, Maintenance, Repairs, Plumbing, Furniture, Personal/Family, Other.

**Income** sits alongside it via a toggle at the top of the same screen — for a PG where rent is collected in bulk rather than tracked per-resident (e.g. a sub-leased property), log the lump sum with a source/description instead of the only options being "track every resident individually" or "don't record it at all." Kept intentionally simpler than Expenses (no correction-flagging workflow) since it has no resident/ledger balance riding on it.

Browse by month with the arrows at the top. The category breakdown card shows exactly where money went, and the Dashboard's net figure (rent collected − all expenses) is always accurate because nothing here is reconstructed from memory — it's whatever you've logged.

**Mistake handling**: only the admin account can edit or delete a payment, expense, or income entry. If a staff member spots an error on a payment/expense, they tap **Flag a Correction** (or **Flag Issue** on a payment) and describe what's wrong — this never deletes anything, it just raises a flag for the admin to review. Open flags appear right at the top of the Settings screen with full context (who flagged it, what record, their reason), and can be resolved by fixing the amount directly (auto-resolves the flag) or dismissing it if no change is needed.

### Menu → Rent Due Soon & Overdue
A short, scannable list of only what actually needs attention: anyone already overdue, anyone partially paid with an open balance, or anyone fully pending with a due date in the next 5 days — residents pending weeks out are deliberately left off so this doesn't just duplicate the full Rent tab. Tap **🔔 Enable Rent Reminders** to opt into a browser notification: once a day per PG, opening the app checks for anything newly due and notifies you if so. This only fires while the app is actually open (no background push while it's closed — see "Architecture notes" below for why).

### Settings (admin only)
- Add a new PG, or edit an existing PG's name/address/landlord details
- Add staff/warden logins, each assigned to **one or more** PGs via checkboxes — a login assigned to just one is locked to it; assigned to several, they get the same property switcher admin has (tap the PG name at the top), scoped only to their assigned properties and enforced server-side on every request
- **Fixed Charges** — save your standard recurring rates (e.g. "Rent to Landlord: ₹2,50,000", "Wi-Fi Plan: ₹1,500") so the current rate is always one tap away. Tap **Log This Month** on any charge to instantly create a real, dated expense entry from that rate — updating the reference rate later never changes past logged expenses, so your historical totals stay accurate.
- **Flagged Corrections** — any open staff-flagged issues appear here first, above everything else, so they don't get missed.

---

## Architecture notes (for whoever's maintaining this later)

- **Single source of truth for money**: every balance (rent due/paid/overdue, advance expected/paid) is computed in one place, `functions/_ledger.js`, and every screen reads through it. Nothing else is allowed to write `rent_ledger.amount_paid`/`status` or `residents.advance_paid` directly — those are always recalculated fresh from the real `payments` table (`recomputeResidentLedger`), specifically so a voided/deleted payment can never keep quietly counting toward a balance.
- **New DB columns ship defensively**: several features (custom advance, first-month due option, multi-PG staff) added new columns via migrations. Every query that touches a newer column tries it first and falls back to the pre-migration query if the column doesn't exist yet — so a deploy never 500s just because the corresponding `wrangler d1 migrations apply --remote` hasn't been run yet on that particular database. Once it has, the fallback path simply never triggers again.
- **PG isolation is structural, not conventional**: every read/write for money (rent, advance, expenses, income) requires a specific `pg_id` and rejects the request without one — there is no code path anywhere that aggregates across multiple PGs. The only cross-PG visibility that exists is an admin's *list* of properties, never their financial data merged together.
- **No cron/scheduled jobs**: Cloudflare Pages doesn't support scheduled functions (that's Workers-only, and would need a second, separately-deployed project). The due-reminder notification is triggered client-side on app open instead of via a background job — see the Menu section above.
- **Frontend is intentionally build-tool-free**: plain `<script>` tags sharing global scope, no bundler, no framework. Every `public/*.js` file's top-level functions are callable from any other file once loaded.

---

## Data safety & backups

All data lives in Cloudflare D1 — never lost by clearing your phone's browser or switching devices. Back up periodically:
```
wrangler d1 export svpg-manager-db --remote --output=backup.sql
```
Save that file somewhere safe (email it to yourself, Google Drive).

## Free tier limits (you won't hit these)

| Service | Free limit |
|---|---|
| Pages | 500 deploys/month, unlimited bandwidth |
| Functions | 100,000 requests/day |
| D1 | 5 GB storage, 5M reads/day, 100K writes/day |

This comfortably covers several PGs at once.

## If something breaks

- **"Unauthorized" everywhere**: session expired (30 days) — log in again.
- **A staff member's newly-assigned second PG isn't showing up for them**: they need to log out and back in — the list of PGs a login can access is baked into their session token at login time, not re-checked live.
- **Setup screen keeps showing**: D1 binding isn't connected (Part 1, Step 5) — check the variable name is exactly `DB`.
- **Local changes don't show live**: make sure you `git push`-ed and ran migrations with `--remote`.
- **A staff member can't see a PG you just added**: assign them to it from Settings → PG access is opt-in per login, never automatic.
- **`wrangler` commands fail with "account is not valid or is not authorized"**: the CLI on that machine is logged into a *different* Cloudflare account than the one owning this project's D1 database (`wrangler whoami` shows which). Either `wrangler login` again as the right account, or skip the CLI entirely — every migration is just one `ALTER TABLE`/`CREATE TABLE` statement; anyone with dashboard access to the right Cloudflare account can run it directly from **Workers & Pages → D1 → (database name) → Console**, no CLI needed at all.
