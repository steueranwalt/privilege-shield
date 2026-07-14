#!/usr/bin/env node
/**
 * Privilege Shield CLI — local batch pseudonymization (DE/CH + EN).
 * Uses realistic pseudonyms (not [CLIENT_1]), with an interactive query first.
 * Dates stay in cleartext. Never uploads documents.
 */
import { resolve, relative } from "node:path";
import {
  anonymizeString,
  restoreText,
  collectPendingAcrossFiles,
} from "../lib/redact.js";
import { createEmptySession, loadSession, saveSession } from "../lib/session.js";
import {
  collectInputs,
  readText,
  writeText,
  mapOutputPath,
  commonRoot,
  parseTermsArg,
  loadTermsFile,
  loadMapFile,
} from "../lib/io.js";
import { promptPseudonyms } from "../lib/prompt.js";
import { uniquifyPseudo } from "../lib/pseudos.js";
import { DEFAULT_ENABLED, TOGGLEABLE } from "../lib/types.js";

const HELP = `
Privilege Shield CLI — lokale Stapel-Pseudonymisierung (Deutsch/Schweiz + English)

USAGE
  privilege-shield anonymize <files|dirs...> --out <dir> --key <key.json> [options]
  privilege-shield deanonymize <files|dirs...> --out <dir> --key <key.json>
  privilege-shield scan <files|dirs...> [options]

OPTIONS
  --out, -o <dir>       Ausgabeverzeichnis (anonymize/deanonymize)
  --key, -k <file>      Sitzungs-Key JSON (Secret; speichert Pseudonym → Klartext)
  --terms <a,b,c>       Zusätzliche Begriffe, die immer ersetzt werden
  --terms-file <path>   Datei mit Begriffen (Komma oder Zeilenumbruch)
  --map-file <path>     Vorab-Zuordnung Klartext → Pseudonym (JSON oder „A => B“-Zeilen)
  --disable <types>     Typen abschalten: ${TOGGLEABLE.join(",")}
  --enable-dates        Daten UND Datumsformen trotzdem ersetzen (Standard: Daten bleiben)
  --auto, -y            Keine Abfrage — vorgeschlagene Pseudonyme übernehmen
  --interactive, -i     Pseudonyme vorher abfragen (Standard bei TTY)
  --placeholders        Altes Format [CLIENT_1] statt realistischer Pseudonyme
  --suffix <str>        Dateiendungs-Suffix (Standard: .redacted)
  --dry-run             Nur melden, nichts schreiben
  --json                Maschinenlesbare Zusammenfassung
  -h, --help            Hilfe

VERHALTEN
  • Offline — keine Netzwerkanfragen
  • Statt [CLIENT_1] werden Pseudonyme gesetzt (idealerweise nach Abfrage)
  • Daten (TT.MM.JJJJ, T.M.JJJJ, 14. Juli 1982, …) bleiben unverändert
  • CHF / EUR / € / $ werden erkannt
  • Verfahrensrollen (Beschwerdeführer, Rekurrent, Steuerpflichtige(r), …) bleiben Label

BEISPIELE
  privilege-shield anonymize ./inbox/ --out ./redacted/ --key ./secrets/ps-key.json
  privilege-shield anonymize ./akten/ --out ./safe/ --key ./secrets/key.json --auto
  privilege-shield deanonymize ./safe/ --out ./restored/ --key ./secrets/ps-key.json
  privilege-shield scan ./inbox/briefing.txt --json
`.trim();

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    cmd: null,
    paths: [],
    out: null,
    key: null,
    terms: [],
    termsFile: null,
    mapFile: null,
    disable: [],
    suffix: null,
    dryRun: false,
    json: false,
    help: false,
    auto: false,
    interactive: false,
    enableDates: false,
    placeholders: false,
  };
  const a = [...argv];
  if (!a.length || a[0] === "-h" || a[0] === "--help") {
    args.help = true;
    return args;
  }
  args.cmd = a.shift();
  while (a.length) {
    const x = a.shift();
    if (x === "-h" || x === "--help") args.help = true;
    else if (x === "--out" || x === "-o") args.out = a.shift();
    else if (x === "--key" || x === "-k") args.key = a.shift();
    else if (x === "--terms") args.terms = parseTermsArg(a.shift());
    else if (x === "--terms-file") args.termsFile = a.shift();
    else if (x === "--map-file") args.mapFile = a.shift();
    else if (x === "--disable")
      args.disable = (a.shift() || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (x === "--suffix") args.suffix = a.shift();
    else if (x === "--dry-run") args.dryRun = true;
    else if (x === "--json") args.json = true;
    else if (x === "--auto" || x === "-y") args.auto = true;
    else if (x === "--interactive" || x === "-i") args.interactive = true;
    else if (x === "--enable-dates") args.enableDates = true;
    else if (x === "--placeholders") args.placeholders = true;
    else if (x.startsWith("-")) die(`Unknown option: ${x}\n\n${HELP}`);
    else args.paths.push(x);
  }
  return args;
}

function enabledFromArgs(args) {
  const enabled = { ...DEFAULT_ENABLED };
  for (const t of args.disable) {
    if (!(t in enabled) && !TOGGLEABLE.includes(t)) {
      die(`Unknown type in --disable: ${t}\nKnown: ${TOGGLEABLE.join(", ")}`);
    }
    enabled[t] = false;
  }
  if (args.enableDates) enabled.date = true;
  else enabled.date = false;
  return enabled;
}

async function cmdScan(args) {
  if (!args.paths.length) die("scan: provide at least one file or directory");
  const files = collectInputs(args.paths);
  if (!files.length) die("scan: no text files found");
  const terms = [...args.terms, ...loadTermsFile(args.termsFile)];
  const enabled = enabledFromArgs(args);
  const session = createEmptySession();
  const results = [];

  for (const file of files) {
    const text = readText(file);
    const r = anonymizeString(text, {
      enabled,
      terms,
      counters: session.counters,
      existingByKey: session.byKey,
      sessionMap: session.map,
      style: args.placeholders ? "placeholders" : "pseudo",
    });
    session.counters = r.counters;
    session.byKey = r.existingByKey;
    session.map = r.sessionMap;
    results.push({
      file,
      entities: r.stats.entities,
      byType: r.stats.byType,
      sample: r.items
        .filter((it) => it.enabled)
        .slice(0, 20)
        .map((it) => ({
          type: it.type,
          value: it.value,
          pseudonym: it.placeholder,
          occurrences: it.occ.length,
        })),
    });
  }

  const summary = {
    files: results.length,
    uniquePseudonyms: Object.keys(session.map).length,
    datesLeftIntact: !enabled.date,
    results,
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `Gescannt: ${summary.files} Datei(en); ${summary.uniquePseudonyms} Pseudonym(e).` +
        ` Daten unverändert: ${summary.datesLeftIntact ? "ja" : "nein"}\n`
    );
    for (const r of results) {
      console.log(`• ${r.file}`);
      console.log(`  ${r.entities} Treffer: ${fmtByType(r.byType)}`);
      for (const s of r.sample.slice(0, 8)) {
        console.log(`    [${s.type}] ${JSON.stringify(s.value)} → ${s.pseudonym}`);
      }
      if (r.sample.length > 8) console.log(`    … +${r.sample.length - 8} weitere`);
    }
    console.log("\nBitte prüfen — Detektoren überflaggen und können etwas übersehen. Nichts geschrieben.");
  }
}

async function cmdAnonymize(args) {
  if (!args.paths.length) die("anonymize: provide at least one file or directory");
  if (!args.key) die("anonymize: --key <file> is required");
  if (!args.out && !args.dryRun) die("anonymize: --out <dir> is required (or use --dry-run)");
  const files = collectInputs(args.paths);
  if (!files.length) die("anonymize: no text files found");

  const keyPath = resolve(args.key);
  let session;
  try {
    session = loadSession(keyPath);
    console.error(`Bestehenden Key geladen: ${keyPath}`);
  } catch {
    session = createEmptySession();
  }

  const terms = [...args.terms, ...loadTermsFile(args.termsFile)];
  const enabled = enabledFromArgs(args);
  const style = args.placeholders ? "placeholders" : "pseudo";
  const root = commonRoot(files);
  const suffix = args.suffix != null ? args.suffix : ".redacted";

  const fileTexts = files.map((file) => ({ file, text: readText(file) }));

  // Optional predeclared Klartext → Pseudonym map (skip prompt for those)
  const mapFile = loadMapFile(args.mapFile);
  if (Object.keys(mapFile).length) {
    console.error(`Map-Datei geladen: ${Object.keys(mapFile).length} Zuordnung(en)`);
  }

  // Phase 1: collect novel entities, then ask for pseudonyms
  const { pending, counters } = collectPendingAcrossFiles(fileTexts, {
    enabled,
    terms,
    counters: session.counters,
    existingByKey: session.byKey,
    sessionMap: session.map,
  });
  session.counters = counters;

  // Apply --map-file matches (exact real value) before interactive prompt
  const preassigned = {};
  const stillPending = [];
  for (const p of pending) {
    if (Object.prototype.hasOwnProperty.call(mapFile, p.value)) {
      const pseudo = uniquifyPseudo(mapFile[p.value], session.map);
      preassigned[p.key] = pseudo;
      session.byKey[p.key] = pseudo;
      session.map[pseudo] = p.value;
    } else {
      stillPending.push(p);
    }
  }

  const wantPrompt = args.interactive || (!args.auto && !args.json);
  const prompted = await promptPseudonyms(stillPending, {
    auto: !wantPrompt || args.auto,
  });
  const overrides = { ...preassigned, ...prompted };

  const written = [];
  for (const { file, text } of fileTexts) {
    const r = anonymizeString(text, {
      enabled,
      terms,
      counters: session.counters,
      existingByKey: session.byKey,
      sessionMap: session.map,
      overrides,
      style,
    });
    session.counters = r.counters;
    session.byKey = r.existingByKey;
    session.map = r.sessionMap;

    let outPath = null;
    if (!args.dryRun) {
      outPath = mapOutputPath(file, args.out, root, suffix);
      writeText(outPath, r.text);
      written.push({ in: file, out: outPath, entities: r.stats.entities });
    } else {
      written.push({ in: file, out: null, entities: r.stats.entities });
    }
  }

  if (!args.dryRun) {
    saveSession(keyPath, session);
    warnIfKeyLooksPublic(keyPath);
  }

  const summary = {
    files: written.length,
    uniquePseudonyms: Object.keys(session.map).length,
    key: keyPath,
    out: args.out ? resolve(args.out) : null,
    datesLeftIntact: !enabled.date,
    written,
  };

  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `Pseudonymisiert: ${summary.files} Datei(en) → ${summary.uniquePseudonyms} Pseudonym(e).` +
        ` Daten unverändert: ${summary.datesLeftIntact ? "ja" : "nein"}`
    );
    for (const w of written) {
      const rel = w.out ? relative(process.cwd(), w.out) : "(dry-run)";
      console.log(`  ${relative(process.cwd(), w.in)} → ${rel}  (${w.entities} Treffer)`);
    }
    if (!args.dryRun) {
      console.log(`\nKey gespeichert: ${keyPath}`);
      console.log(
        "Key geheim halten. Nur redigierte Outputs committen — nie Key oder Klartext."
      );
    }
  }
}

function cmdDeanonymize(args) {
  if (!args.paths.length) die("deanonymize: provide at least one file or directory");
  if (!args.key) die("deanonymize: --key <file> is required");
  if (!args.out && !args.dryRun) die("deanonymize: --out <dir> is required");
  const session = loadSession(resolve(args.key));
  const files = collectInputs(args.paths);
  if (!files.length) die("deanonymize: no text files found");
  const root = commonRoot(files);
  const suffix = args.suffix != null ? args.suffix : ".restored";
  const written = [];

  for (const file of files) {
    const text = readText(file);
    const { text: restored, leftover } = restoreText(text, session.map);
    let outPath = null;
    if (!args.dryRun) {
      const cleanInput = file.replace(/\.redacted(?=\.[^./]+$)/, "");
      const useSuffix = args.suffix != null ? suffix : "";
      outPath = mapOutputPath(cleanInput, args.out, root, useSuffix);
      writeText(outPath, restored);
    }
    written.push({ in: file, out: outPath, leftover });
  }

  const summary = { files: written.length, key: resolve(args.key), written };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `Wiederhergestellt: ${summary.files} Datei(en) mit ${Object.keys(session.map).length} Zuordnung(en).`
    );
    for (const w of written) {
      console.log(
        `  ${relative(process.cwd(), w.in)} → ${w.out ? relative(process.cwd(), w.out) : "(dry-run)"}`
      );
      if (w.leftover.length) {
        console.warn(`    ⚠ unbekannte Platzhalter: ${w.leftover.join(", ")}`);
      }
    }
  }
}

function fmtByType(byType) {
  return Object.entries(byType)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

function warnIfKeyLooksPublic(keyPath) {
  const lower = keyPath.toLowerCase();
  if (!/secret|private|vault|\.keys?\b|credential/.test(lower)) {
    console.warn(
      "⚠ Key-Pfad wirkt nicht privat (kein „secret“/„private“/„vault“ im Pfad). " +
        "Keys außerhalb des Git-Baums ablegen, den der Agent klont."
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd) {
    console.log(HELP);
    process.exit(0);
  }
  switch (args.cmd) {
    case "anonymize":
      return cmdAnonymize(args);
    case "deanonymize":
      return cmdDeanonymize(args);
    case "scan":
      return cmdScan(args);
    default:
      die(`Unknown command: ${args.cmd}\n\n${HELP}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
