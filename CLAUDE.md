# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Shopik** is a clickable prototype of a SaaS platform that lets a small
seller spin up an online store from their Instagram/Telegram in "5 minutes".
It is a **front-end-only demo** — there is no backend, no database, and no
network calls. Everything (shops, products, orders, cart) lives in React state
and is **lost on page refresh**. The UI is in Ukrainian (with a Russian
translation toggle); product copy and code comments are in Ukrainian.

## The single most important fact about this repo

**The entire application is one file: `index.html`** (~2300 lines, ~620 KB).
The bulk of the file size is base64-encoded placeholder product images
(`phImg`, line ~141). There is no `src/`, no `package.json`, and no build
tooling — those were intentionally deleted (see `git log`: "Delete
package.json", "Delete vite.config.js").

If you change anything, you edit `index.html`. There is nothing else.

## How it runs (no build step)

`index.html` is a self-contained static page that loads everything from CDNs
and transpiles JSX **in the browser**:

- React 18 + ReactDOM (UMD production builds from unpkg)
- `@babel/standalone` — transpiles the `<script type="text/babel">` block live
- Tailwind CSS via `cdn.tailwindcss.com` (utility classes in JSX `className`)

To run it, just open the file or serve the directory statically:

```
# any static server works, e.g.
python3 -m http.server 8000   # then open http://localhost:8000
```

There is **no `npm install`, `npm run dev`, or `npm run build`**. The
`README.md` still describes a Vite + React + Tailwind setup — **that README is
stale**; the project no longer has a Node/Vite toolchain. Deployment is simply
serving the static `index.html` (e.g. on Vercel).

## Architecture inside `index.html`

Everything is one default-exported component, `ShopPlatform()` (line ~43),
mounted at the bottom via `ReactDOM.createRoot(...).render(<ShopPlatform />)`
(lines ~2300). Key shape:

- **~81 `useState` hooks**, all declared at the top of the component ("ВСЕ
  ХУКИ НАВЕРХУ" / "all hooks at the top"). Keep this convention — add new hooks
  in the same top block, never conditionally.
- **Routing is a string state**, `page`, switched with `setPage('...')`. The
  render body is a long sequence of `if (page === '...') { return (...) }`
  blocks. Many screens also require `&& activeShop` (e.g.
  `if (page === 'dashboard' && activeShop)`).

### Pages (the `page` values)

Seller / admin side: `home`, `import`, `create`, `building`, `myshops`,
`dashboard`, `bulk`, `orders`, `clients`, `analytics`, `promos`, `settings`.

Buyer / storefront side (rendered as the live "Витрина"/storefront preview):
`preview`, `catalog`, `product`, `cart`, `checkout`, `favs`, `info`.

The seller flow is roughly: `home` → `create` → `building` (loading) →
`dashboard`, with a bottom tab bar (Товари / Аналітика / Витрина / Заявки /
Налашт.) switching between `dashboard`, `analytics`, `preview`, `orders`,
`settings`.

### Data model

State holds an array of `shops`; the currently selected one is `activeShop`.
A shop is created by `makeShop(opts)` (line ~202) and has this shape:

```
{ id, name, slogan, vibe, accent, banner, bannerImage, bannerPos, hours,
  social: { instagram, telegram, tiktok, phone },
  categories: [{ name, subs: [...] }],
  products: [{ id, name, price, category, sub, inStock, preorder, ... }],
  orders:  [{ id, name, phone, product, comment, status }],
  reviews, promos: [{ code, disc, label, uses, clicks, revenue }],
  saleOn, saleEnd, about, delivery, payment,
  trialEnd, paid, showReviews, quickBuy, cartRecs, freeShipFrom, recSizes }
```

Seed/demo data lives near the top: `seedCategories`, `seedProducts`,
`seedOrders`, `seedReviews`, `sampleNames`, and `phImg` (base64 placeholder
images). `seeDemo()` (line ~509) creates a fully populated "PLEASE" demo shop.

### Key helpers (learn these before editing logic)

- `updateShop(patch)` (line ~187) — the canonical way to mutate the active
  shop. It does `setShops(shops.map(s => s.id === updated.id ? updated : s))`.
  **Always update shop data through `updateShop`**, e.g.
  `updateShop({ products: [...activeShop.products, newProd] })`.
- `flash(msg)` (line ~194) — show a transient toast for ~2.2s.
- `makeShop(opts)` — shop factory.
- `buildLook(prod)` — "build a look with a stylist" recommendation logic.
- `t(k)` / `tr` (lines ~527–531) — i18n. `tr` has `ua` and `ru` dictionaries;
  `t(k)` resolves the current `lang` ('ua' default), falling back to Ukrainian
  then the key itself.

### Icons

There is **no icon library**. Icons are inline SVGs built with the `_mkIcon`
helper (line ~14), which mimics the lucide icon style (`Plus`, `Trash2`,
`Search`, `Heart`, `ShoppingBag`, etc.). To add an icon, call `_mkIcon('<svg
inner markup>')` alongside the others.

## Conventions to follow

- **Edit `index.html` directly.** No code generation, no module splitting
  unless explicitly asked — the single-file, CDN, in-browser-Babel setup is the
  intended design.
- **Match the existing JSX + Tailwind style.** Styling is Tailwind utility
  classes plus inline `style={{ backgroundColor: accent, ... }}` for
  theme/accent colors. Dark mode is driven by the `appDark` state.
- **Keep all hooks at the top** of `ShopPlatform`, unconditionally.
- **Add new screens** as a new `if (page === '...') { return (...) }` block and
  navigate to them with `setPage('...')`.
- **Mutate shop state via `updateShop`**, never by editing `activeShop` in
  place.
- **Keep UI text in Ukrainian** (and add Russian strings to `tr.ru` if the text
  is user-facing and routed through `t()`).
- The layout is **mobile-first** — most screens are constrained to a phone-width
  column (e.g. `max-w-sm mx-auto`). Preserve that framing.

## Limitations / gotchas

- No persistence: refreshing the page resets all shops, carts, and orders.
- No real payments, auth, or messaging — Telegram/Instagram links are display
  only; the "trial/paid" fields are demo gating, not real billing.
- Everything depends on CDN availability (React, Babel, Tailwind). There is no
  offline/bundled fallback.
- Because Babel transpiles at runtime, a syntax error anywhere in the script
  block breaks the whole page (blank `#root`). Check the browser console after
  edits.

## Git / workflow

- Active development branch for AI work: `claude/claude-md-docs-zc9dow`.
- Commit `index.html` (and this file) with clear messages; push with
  `git push -u origin <branch>`.
- Do not reintroduce a build toolchain (Vite/package.json) unless explicitly
  requested.
