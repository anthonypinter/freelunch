# Free Meals Tracker — Setup Guide

A step-by-step guide for building and deploying a meal-tracking website using **GitHub Pages** (frontend) and **Supabase** (database, auth, and image storage).

---

## Stack Overview

| Layer | Service | Free Tier |
|---|---|---|
| Frontend | GitHub Pages | Free |
| Database + Auth + Storage | Supabase | Free (500MB DB, 1GB storage) |
| Image CDN | Supabase Storage | Included |

---

## Step 1 — Set Up Your GitHub Repo

1. Go to [github.com](https://github.com) and create a new repository, e.g. `free-meals-tracker`
2. Check **"Add a README file"** so it's not empty
3. Clone it to your computer:
   ```bash
   git clone https://github.com/YOUR_USERNAME/free-meals-tracker.git
   cd free-meals-tracker
   ```
4. Create your basic file structure:
   ```
   free-meals-tracker/
   ├── index.html        ← dashboard / homepage
   ├── login.html        ← login + register
   ├── submit.html       ← meal submission form
   ├── profile.html      ← user's own meal history
   ├── css/
   │   └── style.css
   └── js/
       ├── supabase.js   ← Supabase client setup
       ├── auth.js       ← login/register logic
       ├── dashboard.js  ← leaderboards + carousel
       └── submit.js     ← meal submission logic
   ```
5. Go to your repo **Settings → Pages → Source**, set it to `main` branch and `/ (root)`.

Your site will be live at `https://YOUR_USERNAME.github.io/free-meals-tracker/`

---

## Step 2 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**, give it a name like `free-meals`, set a strong database password, and pick the region closest to you
3. Wait ~2 minutes for it to provision
4. Go to **Project Settings → API** and copy two things — you'll need them later:
   - `Project URL` (looks like `https://xxxx.supabase.co`)
   - `anon public` key (a long string)

---

## Step 3 — Create Your Database Tables

In Supabase, go to **SQL Editor** and run the following:

```sql
-- Semesters table
CREATE TABLE semesters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,           -- e.g. "Fall 2025"
  start_date date NOT NULL,
  end_date date NOT NULL
);

-- Insert your current semester
INSERT INTO semesters (name, start_date, end_date)
VALUES ('Fall 2025', '2025-08-25', '2025-12-15');

-- Meals table
CREATE TABLE meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL,
  photo_url text,
  semester_id uuid REFERENCES semesters(id),
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- Anyone can read meals
CREATE POLICY "Public meals are viewable by everyone"
  ON meals FOR SELECT USING (true);

-- Only the owner can insert their own meals
CREATE POLICY "Users can insert their own meals"
  ON meals FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

## Step 4 — Set Up Photo Storage

1. In Supabase, go to **Storage → New Bucket**
2. Name it `meal-photos`, and check **"Public bucket"** (so photos are viewable without auth)
3. Go to **Storage → Policies** and add a policy:
   - **Allowed operation:** INSERT
   - **Target roles:** authenticated
   - **Expression:** `(auth.role() = 'authenticated')`

---

## Step 5 — Set Up Email Auth

1. In Supabase, go to **Authentication → Providers**
2. **Email** is enabled by default — leave it on
3. Go to **Authentication → URL Configuration** and set:
   - **Site URL:** `https://YOUR_USERNAME.github.io/free-meals-tracker`
   - **Redirect URLs:** add `https://YOUR_USERNAME.github.io/free-meals-tracker/login.html`

---

## Step 6 — Write the Code

### `js/supabase.js` — Supabase client (imported by every page)

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_KEY = 'YOUR_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
```

### `login.html` — Auth logic

```javascript
import { supabase } from './js/supabase.js'

// Register
await supabase.auth.signUp({ email, password })

// Login
await supabase.auth.signInWithPassword({ email, password })

// After login, redirect to dashboard
window.location.href = '/index.html'
```

### `submit.html` — Upload photo then insert meal row

```javascript
// 1. Upload photo to storage
const { data: file } = await supabase.storage
  .from('meal-photos')
  .upload(`public/${Date.now()}.jpg`, photoFile)

// 2. Get the public URL
const { data: { publicUrl } } = supabase.storage
  .from('meal-photos')
  .getPublicUrl(file.path)

// 3. Insert the meal record
await supabase.from('meals').insert({
  user_id: session.user.id,
  description: descriptionText,
  photo_url: publicUrl,
  semester_id: CURRENT_SEMESTER_ID
})
```

### `dashboard.js` — Fetch leaderboard + carousel data

```javascript
const oneWeekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()

// Weekly leaderboard (uses view created in Step 7)
const { data: weekly } = await supabase
  .from('leaderboard_weekly')
  .select('*')
  .limit(10)

// Recent 10 meals for carousel
const { data: recent } = await supabase
  .from('meals')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10)
```

> **Note:** Grouped leaderboard counts are handled via SQL Views in Supabase (see Step 7), not in JavaScript.

---

## Step 7 — Create Leaderboard Views in Supabase

Back in the **SQL Editor**, run:

```sql
-- Weekly leaderboard
CREATE VIEW leaderboard_weekly AS
SELECT user_id, COUNT(*) as meal_count
FROM meals
WHERE created_at >= now() - interval '7 days'
GROUP BY user_id
ORDER BY meal_count DESC;

-- Monthly leaderboard
CREATE VIEW leaderboard_monthly AS
SELECT user_id, COUNT(*) as meal_count
FROM meals
WHERE created_at >= now() - interval '30 days'
GROUP BY user_id
ORDER BY meal_count DESC;

-- Semester leaderboard (update dates to match your semester)
CREATE VIEW leaderboard_semester AS
SELECT user_id, COUNT(*) as meal_count
FROM meals
WHERE created_at >= '2025-08-25'
GROUP BY user_id
ORDER BY meal_count DESC;
```

Querying a leaderboard in JS is then simply:

```javascript
const { data } = await supabase.from('leaderboard_weekly').select('*').limit(10)
```

---

## Step 8 — Deploy

Whenever you're ready to publish changes:

```bash
git add .
git commit -m "describe your changes here"
git push origin main
```

GitHub Pages auto-deploys within ~60 seconds. No build step needed since you're using vanilla JS with ES modules.

---

## How It All Fits Together

```
User visits GitHub Pages site
        ↓
Logs in via Supabase Auth (email/password)
        ↓
Submits meal → photo uploads to Supabase Storage
                meal record saved to Supabase DB
        ↓
Dashboard queries Supabase views for leaderboard counts
+ fetches 10 most recent meals for the carousel
```

---

## Next Steps

- [ ] Write the full HTML/CSS for `index.html` (dashboard + carousel)
- [ ] Write the login/register form in `login.html`
- [ ] Write the meal submission form in `submit.html`
- [ ] Style everything in `css/style.css`
- [ ] Add a user profile page showing individual meal history
- [ ] (Optional) Add email verification on signup
- [ ] (Optional) Add a moderation queue before meals go public
- [ ] (Optional) Add semester auto-detection based on current date