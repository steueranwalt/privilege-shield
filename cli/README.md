# Privilege Shield CLI

Local **batch** pseudonymization (English + German). Same trust idea as the browser tool: documents and the placeholder key never leave your machine.

## Install / run

Requires Node 18+.

```bash
cd cli
node bin/privilege-shield.js --help

# or, from this directory:
npm link          # optional — puts `privilege-shield` on your PATH
```

## Typical Cursor workflow

1. Keep **cleartext** client files and the key **outside** any git repo a Cloud Agent can clone.
2. Batch-redact locally into a folder you *do* commit (or sync) for the agent.
3. Let the Cursor agent work only on redacted text.
4. Restore locally with the key when you need real names again.

```bash
# 1) Pseudonymize a whole inbox (shared placeholders across files)
mkdir -p ../secrets ../redacted
node bin/privilege-shield.js anonymize ../inbox/ \
  --out ../redacted/ \
  --key ../secrets/ps-key.json \
  --terms-file ../terms.txt

# 2) Work in Cursor on ../redacted/ only

# 3) Restore when done
node bin/privilege-shield.js deanonymize ../redacted/ \
  --out ../restored/ \
  --key ../secrets/ps-key.json
```

Add secrets/keys to `.gitignore` (this repo already ignores `secrets/`, `*.ps-key.json`, and common cleartext inbox folders).

## Commands

| Command | Purpose |
|--------|---------|
| `anonymize` | Detect PII, write `*.redacted.*` files, update key |
| `deanonymize` | Replace placeholders using the key |
| `scan` | Preview detections without writing |

### Options

- `--out / -o` — output directory  
- `--key / -k` — session key JSON (secret)  
- `--terms` / `--terms-file` — always-redact phrases  
- `--disable name,entity,…` — turn categories off  
- `--dry-run`, `--json`

## German + English coverage (v1 CLI)

| Category | EN | DE |
|----------|----|----|
| Names / parties | `v.` / `vs.` captions, titles | `gegen`, Herr/Frau/RA/…, Unicode (Müller) |
| Addresses | Street/Ave/… | Straße/Str./Weg/Platz/… |
| IDs | SSN | Steuer-ID patterns, **IBAN** |
| Phones | US | `+49` / `0…` |
| Dates | Jan 15, 2026 | 14.07.2026, 14. Juli 1982 |
| Money | `$` | `€` / EUR / Euro |
| Cases | docket / Case No. | Aktenzeichen / `12 C 345/24` |

Detectors still **over-flag**; spot-check before relying on output. PDFs are out of scope (text extracts only: `.txt`, `.md`, `.csv`, …).

## Tests

```bash
cd cli && npm test
```
