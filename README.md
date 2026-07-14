# Privilege Shield

A free, **100% client-side** PII redaction tool for lawyers, by Hello Paralegal.
Strip client identifiers out of text *before* it touches Claude / ChatGPT / any AI,
then restore the real names locally after the AI responds.

**Core promise: your client never enters the room.** The redaction has no backend and
no network code — save `index.html`, turn wifi off, and redact/restore work identically.

> **Privacy in one line:** the redaction is 100% in your browser and never sends
> anything. The *only* network request in the whole page is the optional email form at
> the bottom — and it sends only your email address (never your document text or the
> placeholder map), and only when you click submit.

## Use it

Just open `index.html` in any browser. That's the whole app — runs in your browser,
nothing uploaded, works offline, open source.

- **Redact:** paste text → the tool detects & highlights likely PII → review (click a
  highlight to keep it in cleartext, or select missed text to add it) → **Confirm &
  redact** → copy the placeholder version into your AI tool.
- **Restore:** paste the AI's reply back → placeholders are swapped to the real values
  locally. The placeholder→value key lives only in the page's memory and is erased on
  reload.

## Deploy as a static file

It's a single file with zero dependencies, so any static host works:

```bash
# Netlify
netlify deploy --dir=privilege-shield --prod

# Vercel
vercel deploy privilege-shield --prod

# GitHub Pages — commit index.html to a repo and enable Pages, or:
# put index.html at the repo root / docs/ and point Pages at it.

# Or literally email the .html file. It needs no server.
```

## The trust model (why it's built this way)

- **No network calls at runtime.** No `fetch`, `XMLHttpRequest`, `WebSocket`, no
  `<script src>`, no CDN, no web fonts, no analytics. The only `<link>` is an inline
  data-URI favicon (makes no request). Verified: with the page open, the Network tab
  stays empty during detect / redact / restore.
- **Open source.** Detection is plain regex + heuristics in readable, commented
  vanilla JS — no minified blob. Read it.
- **Human-review-required.** It never redacts silently: it detects, highlights, and
  *you* confirm or edit. It deliberately over-flags so you remove false positives;
  it can still miss things, so read your text.

## What it detects (v1)

Names (including umlauts, `Herr/Frau/Dr.`, `X v. Y` / `X gegen Y`), SSNs / IdNr,
IBAN, emails, phones (US / `+49` / `+41`), street addresses (EN + Straße/Str.),
PLZ/ZIP, **dates off by default**, account numbers, Aktenzeichen/dockets, and
amounts in `$` / `€` / **CHF**. Same value → same placeholder every time, which is
what makes restore reliable.

**Detection (browser + CLI):** English and German/Swiss — IBAN, Aktenzeichen, Straße,
`gegen`, umlaut names, €/CHF, `+41`, Swiss dates `TT.MM.JJJJ` / `T.M.JJJJ`. **Dates are
off by default** (left in cleartext). Verfahrensrollen (Beschwerdeführer, Rekurrent,
Steuerpflichtige(r), …) stay as labels.

**Not supported in v1:** PDFs (hidden text-layer and metadata failure modes — out of
scope on purpose). Text only.

## Batch CLI (Deutsch / Schweiz + English)

For large folders, use the local CLI under [`cli/`](cli/) — offline, shared
**pseudonyms** across files (with an interactive prompt), DE/CH detectors
(IBAN, Aktenzeichen, Straße, `gegen`, umlauts, €/**CHF**, `+41`, Swiss dates
`TT.MM.JJJJ` / `T.M.JJJJ`). **Dates are left unchanged.** Verfahrensrollen
(Beschwerdeführer, Rekurrent, Steuerpflichtige(r), …) stay as labels.

```bash
cd cli
node bin/privilege-shield.js anonymize ../inbox/ \
  --out ../redacted/ \
  --key ../secrets/ps-key.json

# Cursor agent: work only on redacted/ — never clone cleartext or the key
node bin/privilege-shield.js deanonymize ../redacted/ \
  --out ../restored/ \
  --key ../secrets/ps-key.json
```

See [`cli/README.md`](cli/README.md). The key maps pseudonym → real value — keep it
outside any repo a cloud agent can access.

---

> Review every redaction before use. You remain responsible for protecting client
> confidentiality. This is a tool, not legal advice.

Built by **Hello Paralegal** — [helloparalegal.com](https://helloparalegal.com)
