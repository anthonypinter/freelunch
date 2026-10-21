# The Hot Dog Games

Submit a photo of a hot dog and its toppings, then swipe through everyone else's: right if you'd eat it, left if you wouldn't.

This folder is self-contained. Styles, scripts, and images were copied from The Lunch Games rather than linked, so it can be moved or deployed on its own. It does share the same Supabase project, so Lunch Games accounts work here.

## Pages

| File | What it does |
|---|---|
| `index.html` + `js/swipe.js` | Swipe deck (drag, buttons, or ←/→ keys). Shows the Top Dogs leaderboard when you're out of dogs or signed out |
| `submit.html` + `js/submit.js` | Photo upload, optional name, and toppings picker |
| `login.html` + `js/auth.js` | Sign in / create account. Supports `?next=submit.html` |
| `js/supabase.js` | Supabase client (same project as the main site) |

## Setup

Run `setup.sql` once in the Supabase **SQL Editor**. It creates:

- `hotdogs`: one row per dog (`toppings` is a `text[]`)
- `hotdog_votes`: one swipe per user per dog (`+1` yum, `-1` nope). You can't vote on your own dog.
- `hotdog_leaderboard`: a view with yum/nope tallies and net score
- `hotdog-photos`: a public storage bucket that signed-in users can upload to

Then deploy as usual. GitHub Pages serves it at `/hotdogs/`.
