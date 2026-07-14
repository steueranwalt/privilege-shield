# Cursor-Agent-Workflow (Privilege Shield)

Ziel: Klartext und Key bleiben lokal. Der Agent sieht nur pseudonymisierte Dateien.

```text
inbox/  (Klartext, gitignored)
   │
   │  privilege-shield anonymize … --key secrets/ps-key.json
   ▼
redacted/  ← nur das dem Agent / Git geben
   │         (+ ps-session-meta.json ohne Klartextwerte)
   │
   │  Cursor Cloud/Custom Agent arbeitet hier
   ▼
redacted/ (vom Agent bearbeitet)
   │
   │  privilege-shield deanonymize … --key secrets/ps-key.json  (lokal)
   ▼
restored/  (gitignored)
```

## 1) Lokal batchen (.txt / .md / .docx)

```bash
cd cli
npm install   # einmalig (jszip für .docx)

mkdir -p ../secrets ../redacted ../inbox
# Klartext-Dateien nach ../inbox/ legen (nicht committen)

node bin/privilege-shield.js anonymize ../inbox/ \
  --out ../redacted/ \
  --key ../secrets/ps-key.json \
  --auto
# Interaktiv ohne --auto: Pseudonyme vorher abfragen
# Platzhalter wie im Browser: --placeholders
```

Gleicher Klartextwert → gleicher Token über alle Dateien der Session.

## 2) Was darf ins Agent-Repo?

| Pfad | Agent / Git? |
|------|----------------|
| `redacted/**` | ja |
| `ps-session-meta.json` | ja (nur Token-Namen) |
| `secrets/**`, `*ps-key*` | **nein** |
| `inbox/**`, `cleartext/**`, `restored/**` | **nein** |

`.gitignore` blockiert Klartext/Keys bereits. Zusätzlich gilt `.cursor/rules/privilege-shield-redacted.mdc`.

## 3) Custom / Cloud Agent

- Repo oder Workspace so wählen, dass **nur** `redacted/` (bzw. ein daraus gebautes Repo) geklont wird.
- Automation-Prompt: „Arbeite ausschließlich mit Pseudonymen/Platzhaltern; frage niemals nach echten Identitäten; öffne keine Key-Dateien.“
- Privacy Mode an; keine Secrets in Cloud-Agent-Env legen, die Klartext enthalten.

## 4) Restore — nur lokal, nicht in der Cloud

```bash
node bin/privilege-shield.js deanonymize ../redacted/ \
  --out ../restored/ \
  --key ../secrets/ps-key.json
```

Key idealerweise in einem Vault / verschlüsselten Volume; nie in Chat, PR oder Agent-Transcript.

## .docx-Hinweis

Ersetzung läuft auf der OOXML-Textlayer (`<w:t>`). Werte, die Word über mehrere Runs splittet, können entgehen — kritische Identifiers ggf. zusätzlich als `.txt`/`.md` mitführen oder nach Spot-Check nachziehen.
