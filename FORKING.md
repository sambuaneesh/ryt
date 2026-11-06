# Make your page your own

Every page on Recommend You This is drawn by the code in [`apps/page/`](apps/page/). You can
copy that code, change anything (layout, sections, fonts, animation) and use your copy for
your page. Your recommendations stay on Recommend You This; your code only draws them.

## Set it up (about 5 minutes, no coding needed)

1. **Fork** this repository: the *Fork* button at the top right of GitHub.
2. In your fork, open the **Actions** tab and click **I understand my workflows, go ahead and enable them**.
3. In your fork, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open **Actions → Publish → Run workflow**. Wait for the green tick (1–2 minutes).
   Your page code is now online at `https://<your-username>.github.io/<repository>/`.
5. On Recommend You This, open **Settings → Advanced**, paste that address, press **Test**, then **Save**.

That's it: your page is now drawn by your fork. Every time you push to `main`, it is
published again and your page updates.

To go back to the normal page at any time: **Settings → Advanced → Remove**.

## Change it

```sh
npm install
npm run page    # preview with sample data: http://localhost:4100/preview.html (reloads as you edit)
npm run check   # the test the Publish step runs before going live
```

| File | What it does |
|---|---|
| [`apps/page/render.js`](apps/page/render.js) | The structure: header, sections, footer. `render({ data, theme })` returns HTML. Start here. |
| [`apps/page/style.css`](apps/page/style.css) | The styles. Colours, fonts and sizes come from the person's look as CSS variables (`--ryt-bg`, `--ryt-text`, `--ryt-accent`, `--ryt-font-heading`…). |
| [`apps/page/themes/`](apps/page/themes/) | The basic looks (Paper, Midnight…), as JSON. |
| [`packages/kit/`](packages/kit/) | Shared building blocks: sections, recommendation cards, theme variables. |
| [`apps/page/client.js`](apps/page/client.js) | Talks to Recommend You This (see *Messages*). You rarely need to change it. |

A few starting points:

- **Replace a section.** In `render.js`, add to the `sections` object, for example
  `sections.tried = ({ data }) => '<h2>Tried</h2>' + data.recs.filter(r => r.status === 'tried').map(r => r.title).join(', ')`.
  If your section throws an error, the default one is used instead.
- **Restyle the cards.** Everything has a stable hook you can target in CSS:
  `[data-ryt="rec-card"]`, `[data-ryt="title"]`, `[data-ryt="rating"]`, `[data-ryt="credit"]`, `[data-ryt="hero"]`…
- **Add motion.** CSS animations in `style.css`, or code in `client.js`. Remember: no network (see *Rules*).

Always escape text you put into HTML: use `esc()` from `packages/kit`. `npm run check` tests
your page with hostile data and fails if anything gets through.

## The data your page gets

```js
data = {
  owner: { handle, name, bio, profileUrl, avatar },     // avatar: an image link or null
  links: { send, page, home },                           // "recommend me something", this page, the site
  recs: [{                                               // only what the owner chose to show
    id, title, url, cover, category, tags, pitch, review,
    status,                                              // 'tried' or 'already_done'
    rating,                                              // 1 to 10, or null
    date,                                                // when it was tried, as an ISO date string
    from,                                                // { name, handle, profileUrl }, or null if anonymous
  }],
  recommendedByMe: [{ id, title, to, status, rating }],  // what the owner recommended to others
  stats: { tried, alreadyDone, avgRating },
}
```

Every field is always there with a safe type (missing values become empty strings, empty
lists or `null`), so you never need to check. `theme` is the owner's look: its `tokens`
(colours, fonts, sizes), `settings`, section order and CSS. `client.js` applies it for you
with `themeStyles(theme)`.

## Rules

These keep every visitor safe, so they are not optional:

- Your page runs in a **sandbox**: no cookies, no access to Recommend You This or its database,
  and it can't change the address bar. It only ever gets the data above.
- To open another page on the site, links send a `ryt:navigate` message (`client.js` does this
  for every link). Links that open in a new tab (`target="_blank"`) work as normal.
- If your page shows an error or does not answer within **6 seconds**, visitors see the normal
  page instead. Nobody ever sees a broken page.
- Your page must be served over **https** (GitHub Pages is).

## Messages

What `client.js` and Recommend You This say to each other, if you write your own:

| From | Message | Meaning |
|---|---|---|
| your page | `{ type: 'ryt:hello', contract: 1 }` | I'm loaded, send me the data. |
| the site | `{ type: 'ryt:render', data, theme }` | Here it is. |
| your page | `{ type: 'ryt:ready' }` | Drawn. |
| your page | `{ type: 'ryt:error', message }` | Something broke (the normal page is shown). |
| your page | `{ type: 'ryt:navigate', url }` | Please open this address. |

## Stay up to date

On your fork's GitHub page: **Sync fork → Update branch**. The Publish workflow runs again
and your page picks up the latest fixes. If you changed the same lines, GitHub shows you how
to combine the changes.
