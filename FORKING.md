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
  owner: { handle, name, bio, profileUrl, avatar, note },  // note: the owner's pinned message
  links: { send, page, home, thing },                       // thing: add ?q=<title> for "who else tried it"
  labels: { tried: 'Stuff I tried', … },                    // the owner's own names for blocks
  recs: [{                                                  // only what the owner chose to show
    id, title, url, cover, category, tags, pitch, review,
    status,                                                 // 'tried', 'already_done', 'trying' or 'want' (on their list)
    rating,                                                 // 1 to 10, or null
    date,                                                   // when it was tried (ISO date string)
    from,                                                   // { name, handle, profileUrl }, or null if anonymous
    progress,                                               // for 'trying': "episode 4 of 10"
    pinned,                                                 // keep at the top
    extra,                                                  // the owner's own fields: { "Where I watched": "PVR" }
    reactions,                                              // { '🔥': 3, '👀': 0, '🙌': 1, '😂': 0 }
  }],
  lists: [{ id, title, description, items: [recId] }],     // the owner's lists
  asks: [{ id, text, date }],                               // open requests: "a good thriller?"
  circle: [{ name, handle, profileUrl, avatar, gave, got, avg }],  // people they swap recommendations with
  recommendedByMe: [{ id, title, to, status, rating }],
  stats: { tried, alreadyDone, trying, want, avgRating },
}
```

Every field is always there with a safe type (missing values become empty strings, empty
lists or `null`), so you never need to check. `theme` is the owner's look: its `tokens`
(colours, fonts, sizes, layout), `settings`, the blocks they turned on (`sections`, in order)
and CSS. `client.js` applies it for you with `themeStyles(theme)`.

### Blocks

The page is a stack of blocks the owner picks and orders in Settings → Page:
`hero`, `note`, `now-trying`, `my-list`, `hall-of-fame`, `wall`, `ask`, `tried`, `lists`, `shelf`, `map`,
`taste`, `recommenders`, `circle`, `year`, `shame`, `already-there`, `recommended-by-me`.
Each is a function in [`packages/kit/sections.js`](packages/kit/sections.js). Override one in
`render.js` (`sections.map = ({ data, theme }) => '…'`); a block that throws falls back to the
default, and one that returns `''` is skipped.

### Interactivity

[`apps/page/interact.js`](apps/page/interact.js) adds filters, reactions, "new since your
last visit" and "who else tried it". `client.js` runs it for you. Reactions and "who else
tried it" go through Recommend You This as messages (your page has no network access).

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
| your page | `{ type: 'ryt:action', id, name, args }` | Please do this for me: `react(recId, emoji, ±1)` or `alsoTried(title)`. |
| the site | `{ type: 'ryt:action-result', id, result }` | The answer. |

## Stay up to date

On your fork's GitHub page: **Sync fork → Update branch**. The Publish workflow runs again
and your page picks up the latest fixes. If you changed the same lines, GitHub shows you how
to combine the changes.
