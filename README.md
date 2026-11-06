# Recommend You This

Friends recommend things to you. You try them and share what you think.

- **Your page.** One link. Anyone can recommend you a film, a book, a game, a place, with or
  without an account.
- **Your inbox.** Private. Mark things *to try*, *tried*, *already tried* or *skip*. Rate them,
  write a short review, keep notes only you see.
- **My list.** Your own watch list, reading list, places to go. Add anything yourself; it shows
  on your page under "My list" unless you hide it.
- **Your page, your way.** Turn on, reorder and rename blocks: Now trying, My list, Top rated, Wall of
  fame, Ask me, Lists, Shelf, Map, My taste, Best recommenders, My circle, Year in review,
  Hall of shame. Arrange it as a list, grid, magazine or corkboard, with cards drawn as tickets,
  receipts and cassettes.
- **Wander.** Visitors filter, react, unfold cards, see who else tried something, follow people
  through the circle, or press 🎲 for a surprise.
- **Your look.** Pick one of 327 designs (every theme from the Hugo theme gallery, translated
  to fit), then change colours, fonts and layout.
- **Your code.** Fork this repository and your page is drawn by your own code.
  See **[FORKING.md](FORKING.md)**.

A static site on GitHub Pages, with Supabase for Google sign-in and data. No servers.
Pictures are links; nothing is uploaded.

## Fork it and make your page your own

Fork → enable Actions → Settings → Pages → Source: GitHub Actions → run **Publish** → paste
`https://<you>.github.io/<repo>/` into **Settings → Advanced** on Recommend You This.
The full guide, with what you can change and the data your page gets: **[FORKING.md](FORKING.md)**.

## Run it

```sh
npm install
npm run web:mock   # http://localhost:4000 with a demo world in your browser, no sign-in
                   # ?as=aneesh (richest page), mira, kai, priya, rhea…, ?as=new, ?as=nobody; ?reset
npm run web        # the same against Supabase (needs .env, see .env.example)
npm run page       # just the page code, with sample data: http://localhost:4100/preview.html
npm run check      # tests the page code with empty, huge, messy and hostile data
npm run build      # dist/ for GitHub Pages (the app, plus the page code at dist/page/)
```

## Run your own copy of the whole site

1. **Supabase** (the free plan is enough; a shared project is fine):
   - SQL Editor: run the files in [`supabase/migrations/`](supabase/migrations/) in order (0001 to 0005). They only
     add `ryt_*` tables, a view and functions, and are safe to run twice.
   - Optional, for the `/admin` screen (everyone with a page, only for you): after signing up,
     run `insert into public.ryt_admins (user_id) select id from public.ryt_profiles where handle = '<you>';`
   - Authentication → Providers: turn on **Google**.
   - Authentication → URL Configuration → Redirect URLs: add `http://localhost:4000/**` and
     `https://<you>.github.io/<repo>/**`.
2. **Locally:** copy `.env.example` to `.env` and fill in the project URL and publishable key.
3. **GitHub:** Settings → Pages → Source: **GitHub Actions**. Settings → Secrets and variables →
   Actions → **Variables**: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (both are public by design;
   the database's row-level security protects the data). Optional `BASE_PATH`: `/` for a custom domain.
4. Push to `main`. [`pages.yml`](.github/workflows/pages.yml) checks, builds and publishes.
   [`designs.yml`](.github/workflows/designs.yml) adds new gallery designs every week.

## How it fits together

```
web/                  the app: Vite and plain JavaScript modules (views, Supabase + demo backends)
web/public/designs/   the 327 gallery designs (one small JSON each) and their fonts
apps/page/            the page code that forks change: render.js, style.css, themes/
packages/kit/         themes (tokens, fallbacks, CSS checks) and building blocks (sections, cards)
packages/contract/    the data every page receives, sample data and the safety check
supabase/migrations/  the database: tables, rules (row-level security) and functions
apps/platform/hugo/   the theme translator: builds Hugo themes and measures their style (offline)
scripts/designs/      exports measured designs into web/public/designs
scripts/qa/           checks every design on a real page (contrast, fonts, layout)
apps/platform/*.mjs   the original server prototype, kept for the theme translator
```

People's pages are drawn in a frame, so a design or a fork can never break the rest of the site,
and a page that fails always falls back to the normal one.
