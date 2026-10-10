# Brand assets (originals)

These are the original Wick Research files from the first version of the site. They are kept unmodified as the source of truth.

| File | What it is |
|---|---|
| `wick-research-logo.png` | Original wordmark: cream candle-bars mark + "Wick Research" with glow on a grey field (1536×1024) |
| `wick-research-mark.png` | Original mark without the wordmark (1536×1024); used to make the favicons |
| `wick-research-logo-navy.png` | **Reference artwork**: crisp cream mark and wordmark on navy (supplied 10 Oct 2026). The site's logo files are extracted from this one. |
| `legacy-macro-alpha-consultancy-logo.png` | Earlier "MAC – Macro Alpha Consultancy" logo. **Not used** on the site; kept for the record |

Web derivatives live in `site/assets/img/`. They are extracted from `wick-research-logo-navy.png` by separating the cream artwork from its flat navy background (alpha matte). Nothing is redrawn:
* `logo.png`: full lockup, transparent background (nav, hero, footer, terminal)
* `mark.png`: candle-bars mark only, transparent
* `mark-32/64/180/512.png`, `favicon.ico`: the mark on a navy rounded square (favicons, app icon)
* `og-image.jpg`: 1200×630 link-preview card (logo on navy plus a one-line descriptor)

The grey-background originals (`wick-research-logo.png`, `wick-research-mark.png`) are kept for print or other uses. They are not used on the site because the grey photographic field cannot be removed cleanly.

## Palette (from the original `style.css`)

| Token | Hex | Use |
|---|---|---|
| `--navy` | `#0D1B2A` | page background |
| `--card` | `#0F2330` | panels and cards |
| `--slate` | `#415A77` | brand secondary (buttons, rules) |
| `--cream` | `#F2EECF` | brand accent (logo colour, headings, single-series lines) |
| `--text` | `#E8E8E8` | body text |
