# AGENTS.md

## Cursor Cloud specific instructions

**What this is:** Privilege Shield is a zero-dependency, 100% client-side static site. There is no build system, package manager, backend, tests, or lint config. The tracked files are just `index.html` (the app), `kit.html` (a static content page), and `README.md`.

**Run it (dev):** serve the repo root as static files and open the pages in a browser. Any static server works, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html` (main app) or `http://localhost:8000/kit.html`.

**Notes / gotchas:**
- No dependencies to install — the update script is intentionally a no-op. Do not add build/test/lint tooling unless the task requires it.
- The app is designed to run with no network calls. The only runtime network request in `index.html` is the optional email form at the very bottom (posts to an external endpoint); everything else (PII detect/redact/restore) is pure in-browser JS.
- Core functionality to smoke-test: paste text (or click "Try an example") → "Detect PII" → "Confirm & redact →" produces placeholder text → paste that into the Restore panel → "Restore real values" swaps placeholders back. The placeholder→value key lives only in page memory and is erased on reload.
