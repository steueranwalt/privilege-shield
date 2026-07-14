# Privilege Shield CLI

Lokale **Stapel-Pseudonymisierung** (Deutsch / Deutsch-Schweiz / English).  
Gleiche Trust-Idee wie das Browser-Tool: Dokumente und Key verlassen Ihren Rechner nicht.

## Verhalten

| Thema | Default |
|--------|---------|
| Ersetzung | **Pseudonyme** (z. B. `Alex Berner`), nicht `[CLIENT_1]` |
| Abfrage | Interaktiv vor dem Schreiben (Enter = Vorschlag, `-` = behalten) |
| Daten | **bleiben unverändert** (TT.MM.JJJJ, T.M.JJJJ, 14. Juli 1982, …) |
| Währung | `$`, `€`/`EUR`, **`CHF`/`Fr.`** |
| Telefon | US, `+49`, **`+41`** |
| Rollen | Labels bleiben: Einspruchsführer, Beschwerdeführer/‑gegner, Antragsteller/‑gegner, Kläger/Beklagte, Steuerpflichtige(r), Rekurrent/Rekursgegner |

## Install / starten

Node 18+.

```bash
cd cli
node bin/privilege-shield.js --help
```

## Cursor-Workflow

1. Klartext + Key **außerhalb** jedes Repos halten, das ein Cloud-Agent klonen kann.  
2. Lokal batch-pseudonymisieren.  
3. Agent nur auf dem redigierten Ordner arbeiten lassen.  
4. Lokal mit dem Key wiederherstellen.

```bash
mkdir -p ../secrets ../redacted

# Mit Abfrage der Pseudonyme (TTY)
node bin/privilege-shield.js anonymize ../inbox/ \
  --out ../redacted/ \
  --key ../secrets/ps-key.json

# Ohne Abfrage (CI / Skripte)
node bin/privilege-shield.js anonymize ../inbox/ \
  --out ../redacted/ \
  --key ../secrets/ps-key.json \
  --auto

node bin/privilege-shield.js deanonymize ../redacted/ \
  --out ../restored/ \
  --key ../secrets/ps-key.json
```

## Befehle

| Befehl | Zweck |
|--------|--------|
| `anonymize` | Erkennen, Pseudonyme setzen, `*.redacted.*` schreiben, Key aktualisieren |
| `deanonymize` | Pseudonyme anhand des Keys zurücksetzen |
| `scan` | Vorschau ohne Schreiben |

Wichtige Optionen: `--auto` / `-y`, `--interactive` / `-i`, `--enable-dates` (nicht empfohlen), `--placeholders` (altes `[TYPE_n]`), `--terms`, `--disable`.

## Tests

```bash
cd cli && npm test
```
