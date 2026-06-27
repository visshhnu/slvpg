# PG Manager — Sri Lakshmi Venkateshwara Luxury Co-Living PG

A simple, free, mobile-first web app to manage your PG:
- **Rooms & beds** — see every floor, every room, who's in which bed, what's vacant
- **Residents** — full hosteller details, with a priority list of who's vacating and when
- **Rent collection** — month-by-month, who's paid, who's pending, who's overdue (past the 5th)
- **Expenses** — electricity, maintenance, salary, etc. so you can see money going out, not just coming in
- **Dashboard** — one screen with occupancy %, money collected, money pending, and net for the month

Built to run **completely free** on Cloudflare Pages + Cloudflare D1 (database). No monthly hosting bill. Works on any phone browser, and can be "installed" to a phone home screen like an app.

---

## How this is built (so you understand what you own)

- **Frontend**: Plain HTML/CSS/JavaScript — no complicated frameworks, no build step. Easy for any future developer (or AI assistant) to read and edit.
- **Backend**: Cloudflare Pages Functions — small serverless functions that read/write the database.
- **Database**: Cloudflare D1 — a real shared SQL database, so you and your staff always see the same live data, from any phone or computer.
- **Hosting**: Cloudflare Pages — free, fast, gives you a `yourapp.pages.dev` web address (you can later connect a custom domain like `pg.yourdomain.com` if you buy one).

Everything fits inside Cloudflare's free tier for a PG of this size (29 rooms). You will not be charged unless you deliberately upgrade.

---

## Part 1 — One-time setup (do this once)

You will need:
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A free [GitHub account](https://github.com/signup) (to hold your code so Cloudflare can deploy it)
- A computer (setup is easier on a laptop/desktop, even though daily use will be on mobile)

### Step 1 — Put this project on GitHub

1. Go to [github.com/new](https://github.com/new) and create a new **private** repository called `pg-manager`.
2. On your computer, open a terminal in this project folder and run:
   ```
   git init
   git add .
   git commit -m "Initial PG Manager app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pg-manager.git
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your actual GitHub username. GitHub will show you this exact command on the page after you create the repo.)

### Step 2 — Create the database on Cloudflare

1. Install Wrangler (Cloudflare's command-line tool) if you haven't:
   ```
   npm install -g wrangler
   ```
2. Log in to Cloudflare from the terminal:
   ```
   wrangler login
   ```
   This opens a browser tab — click "Allow."
3. Create your database:
   ```
   wrangler d1 create pg-manager-db
   ```
4. This prints something like:
   ```
   [[d1_databases]]
   binding = "DB"
   database_name = "pg-manager-db"
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```
5. Open `wrangler.toml` in this project and replace `REPLACE_WITH_YOUR_DATABASE_ID` with the real `database_id` you were just given. Save the file.
6. Push this change to GitHub too:
   ```
   git add wrangler.toml
   git commit -m "Add real database id"
   git push
   ```

### Step 3 — Load the room structure into the database

This creates your 29 rooms (matching your flyer: Ground+6 floors) in the live database:
```
wrangler d1 migrations apply pg-manager-db --remote
```
Type `y` if it asks for confirmation.

> You can edit room numbers, rent amounts, or sharing type later from inside the app itself (Rooms tab → + button), so don't worry about getting every detail perfect right now.

### Step 4 — Connect Cloudflare Pages to your GitHub repo

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create Application** → **Pages** → **Connect to Git**.
2. Choose your `pg-manager` repository.
3. Build settings:
   - **Framework preset**: None
   - **Build command**: (leave blank)
   - **Build output directory**: `public`
4. Click **Save and Deploy**.

### Step 5 — Bind the database to your Pages project

Your deployed site can't see the database yet — you need to connect them:
1. In Cloudflare dashboard, open your new Pages project → **Settings** → **Functions** → **D1 database bindings**.
2. Click **Add binding**.
   - **Variable name**: `DB` (must be exactly this, capital letters)
   - **D1 database**: select `pg-manager-db`
3. Save, then go to **Deployments** and click **Retry deployment** (or just push any small change to GitHub) so the binding takes effect.

### Step 6 — Create your owner login

1. Visit your live site: `https://pg-manager-xxx.pages.dev` (Cloudflare shows you the exact URL after deploy).
2. Since no account exists yet, you'll see a **"Create your owner login"** form automatically. Fill in your name, phone, a username, and a password (6+ characters).
3. Click **Create Owner Account**, then log in.

That's it — setup is done. This form disables itself automatically after your first account is created, so it's safe to leave live.

---

## Part 2 — Using the app day to day

### Dashboard (Home tab)
Shows at a glance: beds occupied vs total, this month's rent collected vs pending, expenses, and net money. Also lists everyone who has given vacate notice, sorted with the earliest leaver first — this is your **priority list**.

### Rooms tab
Floor-by-floor grid. Green = full, yellow = partially filled, white = empty. Tap any room to see bed-by-bed detail and assign a new resident to a vacant bed. Tap **+** to add a brand new room if you expand the PG later.

### Residents tab
Three filters: **Active**, **Vacating** (notice given), **Vacated** (history). Tap any resident to see their full details and payment history. From here you:
- **Record Vacate Notice** — log the date they informed you and when they plan to leave. Per your house rules, this is what determines if their advance is refundable.
- **Mark as Vacated** — frees up their bed for a new resident and records any refund paid.

Tap **+** to add a new resident to a vacant bed.

### Rent tab
Shows the current month's rent status for every active resident — paid, pending, partial, or overdue (automatically flagged once it's past the 5th, per your house rule). Tap **Collect** next to any pending resident to record a payment (cash/UPI/bank transfer). Use the arrows at the top to look at past or future months.

### Expenses tab
Log anything you pay out — electricity, maintenance, staff salary, groceries, Wi-Fi, water. This is what completes the picture: rent collected minus expenses paid = your actual net income, visible right on the Dashboard.

### Settings tab
Owner-only: add staff/warden logins here. Each staff member gets their own username and password, and sees the exact same live data as you (it's all one shared database).

---

## Adding staff/warden logins

Log in as the owner, go to the **Settings** tab, and tap **+**. Fill in their name and a username/password — that's it, they can now log in from their own phone and see the same live data as you.

---

## Data safety

- All your data lives in Cloudflare D1, which is a real database with redundancy — it is **not** stored in the browser, so switching phones or clearing browser data never loses anything.
- Recommended: every few months, back up your data by running:
  ```
  wrangler d1 export pg-manager-db --remote --output=backup.sql
  ```
  Keep that file somewhere safe (email it to yourself, save to Google Drive).

## Free tier limits (you will not hit these for a 29-room PG)

| Service | Free limit |
|---|---|
| Pages | 500 deploys/month, unlimited bandwidth |
| Workers/Functions | 100,000 requests/day |
| D1 database | 5 GB storage, 5M reads/day, 100K writes/day |

## If something breaks

- **"Unauthorized" errors everywhere**: your login session expired (sessions last 30 days) — just log in again.
- **Setup form keeps showing**: the database binding (Part 1, Step 5) likely isn't connected — double check the variable name is exactly `DB`.
- **Changes you make locally don't show on the live site**: make sure you `git push`-ed, and that you ran migrations with `--remote` (not `--local`, which only affects your own computer).
