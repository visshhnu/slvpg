# SVPG Manager — Multi-PG Operations System

A simple, free, mobile-first web app to manage one or more PGs:
- **Multi-PG** — one admin login sees every property; staff/wardens are assigned to exactly one PG and only see that PG's data
- **Rooms & facilities** — floor-by-floor layout, bed-by-bed occupancy, a standard facility checklist per room (bed, mattress, fan, geyser, attached bathroom, etc.) with condition tracking, and a maintenance flag for rooms that need attention
- **Residents** — full hosteller profile (phone, Aadhaar, emergency contact, agreement signed, police verification status), with automatic refund-eligibility calculation based on notice period
- **Rent collection** — month-by-month, who's paid, who's pending, who's overdue past the 5th
- **Expenses — everything that goes out** — groceries, milk, electricity, water, Wi-Fi, staff salary, and the rent *you* pay to the landlord, all categorized so month-end is just reading a number, never reconstructing from memory
- **Dashboard** — occupancy, this month's money in vs out, category breakdown of every expense, rooms needing maintenance, and a priority list of who's vacating soonest with their refund eligibility

Runs **completely free** on Cloudflare Pages + Cloudflare D1. No monthly hosting bill.

---

## What changed from the single-PG version

| | v1 | v2 (this version) |
|---|---|---|
| PGs supported | One | Unlimited |
| Staff access | Everyone sees everything | Admin sees all; staff locked to their assigned PG |
| Expense categories | Generic | Specific: groceries, milk, electricity, water, wifi, landlord rent, salary, maintenance, etc. |
| Room facilities | Not tracked | Full checklist per room with condition (good/damaged/missing) |
| Refund eligibility | Manual judgment | Calculated automatically from notice period (30-day rule) |
| Maintenance tracking | Not present | Per-room flag + note, surfaced on dashboard |

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
This creates your first PG (Sri Lakshmi Venkateshwara) with its 29 rooms and standard facility checklist already filled in.

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

### Switching PGs (admin only)
Tap the property name at the top of the screen. You'll see every PG you manage — tap one to switch the whole app to that property's data, or tap **+ Add Another PG** to bring a new property online. Staff logins don't see this — they're locked to their assigned PG automatically.

### Rooms
Floor-by-floor grid, color-coded by occupancy. A small red dot means the room needs maintenance. Tap any room to:
- See bed-by-bed occupancy and assign new residents to vacant beds
- Mark the room for maintenance with a note (clears the dashboard alert once unchecked)
- Review and update the facility checklist (12 standard items per room) — mark anything damaged or missing during check-in/checkout inspections

### Residents
Filter by Active / Vacating / Vacated. Full profile includes Aadhaar, agreement status, police verification. **Record Vacate Notice** logs the date — the app then automatically tells you whether they're eligible for their advance refund based on the 30-day rule, no manual calculation needed.

### Rent
Month-by-month view, auto-generates each resident's due amount, flags overdue (past the 5th), one-tap to collect a payment.

### Expenses
This is your complete money-out picture. Categories cover exactly what you described needing to track:
- **Groceries** (food ingredients), **Milk**, **Electricity**, **Water**, **Wi-Fi**
- **Rent paid to Landlord** — this is what *you* pay out, kept completely separate from resident rent income so the two never get confused
- Staff Salary, Housekeeping, Maintenance, Repairs, Plumbing, Furniture, Cleaning, Other

Browse by month with the arrows at the top. Tap any entry to edit or delete it. The category breakdown card shows exactly where money went, and the Dashboard's net figure (rent collected − all expenses) is always accurate because nothing here is reconstructed from memory — it's whatever you've logged.

### Settings (admin only)
- Add a new PG, or edit an existing PG's name/address/landlord details
- Add staff/warden logins, each assigned to one specific PG — they'll only ever see that property's rooms, residents, rent, and expenses

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
- **Setup screen keeps showing**: D1 binding isn't connected (Part 1, Step 5) — check the variable name is exactly `DB`.
- **Local changes don't show live**: make sure you `git push`-ed and ran migrations with `--remote`.
- **A staff member can't see a PG you just added**: assign them to it from Settings → they're locked to whichever PG they were created under.
