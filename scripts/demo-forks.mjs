// Creates local git repos that stand in for GitHub forks of this repo:
//   zine    a completely different frontend (main)
//   broken  main: crashes in the browser (shell falls back to the default page)
//           bad-escape: forgets to escape user content (rejected by the conformance check)
// Usage: node scripts/demo-forks.mjs [outDir]   (default: ../forks)

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT, FORKS_DIR } from '../apps/platform/config.mjs'

const outDir = path.resolve(process.argv[2] ?? FORKS_DIR)
const SKIP = new Set(['.git', '.data', 'node_modules'])

const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=demo fork', '-c', 'user.email=fork@example.invalid', ...args], { stdio: 'pipe' })
const edit = (dir, file, fn) => fs.writeFileSync(path.join(dir, file), fn(fs.readFileSync(path.join(dir, file), 'utf8')))
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text)

function fork(name, mutate, branches = {}) {
  const dir = path.join(outDir, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.cpSync(REPO_ROOT, dir, { recursive: true, filter: src => !SKIP.has(path.basename(src)) })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Fork of RYT')
  mutate(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `${name}: customise the page`)
  for (const [branch, change] of Object.entries(branches)) {
    git(dir, 'checkout', '-q', '-b', branch)
    change(dir)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', `${name}: ${branch}`)
    git(dir, 'checkout', '-q', 'main')
  }
  console.log(`  ${dir}  (${['main', ...Object.keys(branches)].join(', ')})`)
}

const ZINE_RENDER = `// zine fork: throws away the default sections and renders a cut-and-paste photocopied zine.
import { esc, personLink } from '../../packages/kit/index.js'

const tilt = i => ((i * 37) % 7) - 3

const card = (r, i) => \`<figure data-ryt="rec-card" data-status="tried" style="--tilt:\${tilt(i)}deg">
  <div class="stamp">\${r.rating ?? '?'}<small>/10</small></div>
  <figcaption>
    <h3 data-ryt="title">\${esc(r.title)}</h3>
    \${r.review ? \`<p data-ryt="review">\${esc(r.review)}</p>\` : ''}
    <p data-ryt="credit">— from \${r.from ? personLink(r.from) : 'a secret admirer'}</p>
  </figcaption>
</figure>\`

export function render({ data }) {
  const o = data.owner
  const tried = data.recs.filter(r => r.status === 'tried')
  const been = data.recs.filter(r => r.status === 'already_done')
  return \`<div data-ryt="page" class="zine">
  <header class="masthead">
    <p class="issue">ISSUE #\${data.stats.tried} · THINGS I WAS TOLD TO TRY</p>
    <h1>\${esc(o.name)}'s<br>rec zine</h1>
    \${o.bio ? \`<p class="bio">\${esc(o.bio)}</p>\` : ''}
  </header>
  <section class="wall">\${tried.map(card).join('') || '<p class="empty">nothing tried yet. send me something!</p>'}</section>
  \${been.length ? \`<section class="been"><h2>been there, done that</h2><ul>\${been.map(r => \`<li data-ryt="rec-card" data-status="already_done">\${esc(r.title)} <span>via \${personLink(r.from)}</span></li>\`).join('')}</ul></section>\` : ''}
  \${data.recommendedByMe.length ? \`<section class="been"><h2>stuff i pushed on people</h2><ul>\${data.recommendedByMe.map(r => \`<li>\${esc(r.title)} <span>→ \${personLink(r.to)} \${r.rating ? r.rating + '/10' : ''}</span></li>\`).join('')}</ul></section>\` : ''}
</div>\`
}
`

const ZINE_CSS = `/* zine fork styles: ignores most theme tokens on purpose. Forks may do that. */
@layer theme {
  body {
    background: #efe9dc repeating-linear-gradient(0deg, transparent 0 27px, rgb(0 0 0 / .04) 27px 28px);
    color: #1a1a1a;
    font-family: "Caveat", cursive;
    font-size: 21px;
  }
  .zine { max-width: 1050px; margin: 0 auto; padding: 32px 18px 60px; }
  .masthead { border: 4px solid #1a1a1a; padding: 18px 22px; background: #fff; transform: rotate(-1deg); box-shadow: 8px 8px 0 #1a1a1a; margin-bottom: 40px; }
  .masthead h1 { font-family: "Rubik Mono One", "Arial Black", sans-serif; font-size: clamp(2rem, 7vw, 4.2rem); line-height: .95; margin: 6px 0; text-transform: uppercase; }
  .issue { margin: 0; font: 700 12px ui-monospace, monospace; letter-spacing: .2em; }
  .bio { margin: 6px 0 0; }
  .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 30px; }
  figure[data-ryt="rec-card"] { margin: 0; background: #fff; padding: 14px 14px 18px; box-shadow: 0 2px 0 rgb(0 0 0 / .15), 0 12px 24px rgb(0 0 0 / .12); transform: rotate(var(--tilt)); position: relative; overflow-wrap: anywhere; transition: transform .2s; }
  figure[data-ryt="rec-card"]:hover { transform: rotate(0) scale(1.03); z-index: 1; }
  figure[data-ryt="rec-card"]::before { content: ""; position: absolute; top: -12px; left: 50%; width: 90px; height: 24px; translate: -50% 0; background: rgb(255 230 120 / .75); rotate: -3deg; }
  .stamp { position: absolute; top: 10px; right: 10px; width: 64px; height: 64px; border-radius: 50%; border: 3px solid #c2410c; color: #c2410c; display: grid; place-content: center; text-align: center; font: 800 22px/1 ui-monospace, monospace; rotate: 12deg; }
  .stamp small { font-size: 10px; }
  figcaption h3 { font-size: 30px; margin: 0 72px 6px 0; line-height: 1; }
  figcaption p { margin: 4px 0 0; }
  [data-ryt="credit"] a { color: #1d4ed8; }
  .been { margin-top: 46px; background: #1a1a1a; color: #efe9dc; padding: 18px 22px; transform: rotate(.6deg); }
  .been h2 { font: 800 14px ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; margin: 0 0 8px; }
  .been ul { margin: 0; padding-left: 20px; }
  .been span, .been a { color: #fbbf24; }
  .empty { font-size: 28px; }
}
`

const ZINE_THEME = JSON.stringify({ label: 'Zine', description: 'Photocopied zine (from the zine fork).', extends: 'base', tokens: { 'font.body': 'Caveat' } }, null, 2)

console.log(`creating demo forks in ${outDir}`)
fs.mkdirSync(outDir, { recursive: true })

fork('zine', dir => {
  write(dir, 'apps/page/render.js', ZINE_RENDER)
  write(dir, 'apps/page/zine.css', ZINE_CSS)
  write(dir, 'apps/page/themes/zine.json', ZINE_THEME + '\n')
  edit(dir, 'apps/page/manifest.json', s => s.replace('"RYT default page"', '"zine"').replace('"base"', '"zine"'))
  edit(dir, 'apps/page/index.html', s => s.replace('<link rel="stylesheet" href="./style.css">',
    '<link rel="stylesheet" href="./style.css">\n  <link rel="stylesheet" href="./zine.css">\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap">'))
})

fork('broken', dir => {
  // A typo that only shows up in the browser. Passes the server-side check, crashes at runtime.
  edit(dir, 'apps/page/client.js', s => s.replace("getElementById('root')", "getElementById('roott')"))
}, {
  'bad-escape': dir => {
    edit(dir, 'apps/page/client.js', s => s.replace("getElementById('roott')", "getElementById('root')"))
    edit(dir, 'apps/page/render.js', s => s.replace('export const sections = {}',
      "export const sections = {\n  tried: ({ data }) => data.recs.filter(r => r.status === 'tried').map(r => `<h3>${r.title}</h3><p>${r.review}</p>`).join(''),\n}"))
  },
})
