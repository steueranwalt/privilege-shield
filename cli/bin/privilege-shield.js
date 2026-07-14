#!/usr/bin/env node
/**
 * Privilege Shield CLI — local batch pseudonymization (DE/CH + EN).
 * Formats: .txt / .md / .csv / … and .docx text-layer.
 * Shared token/pseudonym map across related files. Key stays local — never commit it.
 */
import { resolve, relative } from "node:path";
import { anonymizeString, collectPendingAcrossFiles } from "../lib/redact.js";
import {
  loadDocument,
  anonymizeDocument,
  restoreDocument,
  writeDocument,
} from "../lib/documents.js";
import { createEmptySession, loadSession, saveSession } from "../lib/session.js";
import {
  collectInputs,
  mapOutputPath,
  commonRoot,
  parseTermsArg,
  loadTermsFile,
  loadMapFile,
  writeText,
} from "../lib/io.js";
import { promptPseudonyms } from "../lib/prompt.js";
import { uniquifyPseudo } from "../lib/pseudos.js";
import { DEFAULT_ENABLED, TOGGLEABLE } from "../lib/types.js";

const HELP = `
Privilege Shield CLI — lokale Stapel-Pseudonymisierung (Deutsch/Schweiz + English)

FORMATE
  .txt .md .csv .json .html … sowie .docx (Textlayer in word/*.xml)

USAGE
  privilege-shield anonymize <files|dirs...> --out <dir> --key <key.json> [options]
  privilege-shield deanonymize <files|dirs...> --out <dir> --key <key.json>
  privilege-shield scan <files|dirs...> [options]

OPTIONS
  --out, -o <dir>       Ausgabeverzeichnis (nur redigierte Outputs — das Agent-Repo)
  --key, -k <file>      Sitzungs-Key (Secret; Token/Pseudonym → Klartext) — NIE committen
  --terms / --terms-file
  --map-file <path>     Vorab Klartext → Pseudonym
  --disable <types>     ${TOGGLEABLE.join(",")}
  --enable-dates        Daten ersetzen (Standard: Daten bleiben)
  --auto, -y            Keine Abfrage
  --interactive, -i     Pseudonyme abfragen (Standard bei TTY)
  --placeholders        [CLIENT_1]-Stil statt realistischer Pseudonyme
  --suffix <str>        Standard: .redacted
  --dry-run / --json / -h

CURSOR-WORKFLOW
  1) Klartext nur in inbox/ (gitignored). Key in secrets/ oder Vault.
  2) Lokal: privilege-shield anonymize inbox/ --out redacted/ --key secrets/ps-key.json
  3) Nur redacted/ dem Cursor-Agent geben / committen — nie Key, nie inbox/.
  4) Restore lokal: privilege-shield deanonymize redacted/ --out restored/ --key secrets/ps-key.json

  Gleicher Klartextwert → gleicher Token über alle Dateien der Session (wie im Browser).
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
  enabled.date = !!args.enableDates;
  return enabled;
}

async function loadAll(files) {
  const docs = [];
  for (const file of files) docs.push(await loadDocument(file));
  return docs;
}

async function cmdScan(args) {
  if (!args.paths.length) die("scan: provide at least one file or directory");
  const files = collectInputs(args.paths);
  if (!files.length) die("scan: no supported files found (.txt/.md/.docx/…)");
  const terms = [...args.terms, ...loadTermsFile(args.termsFile)];
  const enabled = enabledFromArgs(args);
  const session = createEmptySession();
  const results = [];
  const docs = await loadAll(files);

  for (const doc of docs) {
    const r = anonymizeString(doc.text, {
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
      file: doc.path,
      kind: doc.kind,
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
      `Gescannt: ${summary.files} Datei(en); ${summary.uniquePseudonyms} Token/Pseudonym(e).` +
        ` Daten unverändert: ${summary.datesLeftIntact ? "ja" : "nein"}\n`
    );
    for (const r of results) {
      console.log(`• ${r.file} [${r.kind}]`);
      console.log(`  ${r.entities} Treffer: ${fmtByType(r.byType)}`);
      for (const s of r.sample.slice(0, 8)) {
        console.log(`    [${s.type}] ${JSON.stringify(s.value)} → ${s.pseudonym}`);
      }
    }
    console.log("\nNichts geschrieben. Key/Klartext nie dem Agent zeigen.");
  }
}

async function cmdAnonymize(args) {
  if (!args.paths.length) die("anonymize: provide at least one file or directory");
  if (!args.key) die("anonymize: --key <file> is required");
  if (!args.out && !args.dryRun) die("anonymize: --out <dir> is required (or use --dry-run)");
  const files = collectInputs(args.paths);
  if (!files.length) die("anonymize: no supported files found");

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

  const docs = await loadAll(files);
  const fileTexts = docs.map((d) => ({ file: d.path, text: d.text }));

  const mapFile = loadMapFile(args.mapFile);
  if (Object.keys(mapFile).length) {
    console.error(`Map-Datei geladen: ${Object.keys(mapFile).length} Zuordnung(en)`);
  }

  const { pending, counters } = collectPendingAcrossFiles(fileTexts, {
    enabled,
    terms,
    counters: session.counters,
    existingByKey: session.byKey,
    sessionMap: session.map,
    style,
  });
  session.counters = counters;

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
  for (const doc of docs) {
    const r = await anonymizeDocument(doc, {
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
      outPath = mapOutputPath(doc.path, args.out, root, suffix);
      writeDocument(outPath, r);
      written.push({
        in: doc.path,
        out: outPath,
        kind: doc.kind,
        entities: r.stats.entities,
      });
    } else {
      written.push({
        in: doc.path,
        out: null,
        kind: doc.kind,
        entities: r.stats.entities,
      });
    }
  }

  if (!args.dryRun) {
    saveSession(keyPath, session);
    warnIfKeyLooksPublic(keyPath);
    writeMetaSidecar(args.out, session, written);
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
      `Pseudonymisiert: ${summary.files} Datei(en) → ${summary.uniquePseudonyms} Token(s).` +
        ` Daten unverändert: ${summary.datesLeftIntact ? "ja" : "nein"}`
    );
    for (const w of written) {
      const rel = w.out ? relative(process.cwd(), w.out) : "(dry-run)";
      console.log(
        `  ${relative(process.cwd(), w.in)} → ${rel}  [${w.kind}, ${w.entities} Treffer]`
      );
    }
    if (!args.dryRun) {
      console.log(`\nKey: ${keyPath}  ← geheim halten, nie committen, nie dem Agent zeigen.`);
      console.log("Nur den --out-Ordner (redacted/) dem Cursor-Agent geben.");
    }
  }
}

async function cmdDeanonymize(args) {
  if (!args.paths.length) die("deanonymize: provide at least one file or directory");
  if (!args.key) die("deanonymize: --key <file> is required");
  if (!args.out && !args.dryRun) die("deanonymize: --out <dir> is required");
  const session = loadSession(resolve(args.key));
  const files = collectInputs(args.paths);
  if (!files.length) die("deanonymize: no supported files found");
  const root = commonRoot(files);
  const suffix = args.suffix != null ? args.suffix : ".restored";
  const written = [];
  const docs = await loadAll(files);

  for (const doc of docs) {
    const restored = await restoreDocument(doc, session.map);
    let outPath = null;
    if (!args.dryRun) {
      const cleanInput = doc.path.replace(/\.redacted(?=\.[^./]+$)/, "");
      const useSuffix = args.suffix != null ? suffix : "";
      outPath = mapOutputPath(cleanInput, args.out, root, useSuffix);
      writeDocument(outPath, restored);
    }
    written.push({
      in: doc.path,
      out: outPath,
      kind: doc.kind,
      leftover: restored.leftover || [],
    });
  }

  const summary = { files: written.length, key: resolve(args.key), written };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `Wiederhergestellt (lokal): ${summary.files} Datei(en) mit ${Object.keys(session.map).length} Zuordnung(en).`
    );
    for (const w of written) {
      console.log(
        `  ${relative(process.cwd(), w.in)} → ${w.out ? relative(process.cwd(), w.out) : "(dry-run)"} [${w.kind}]`
      );
      if (w.leftover.length) {
        console.warn(`    ⚠ unbekannte Platzhalter: ${w.leftover.join(", ")}`);
      }
    }
    console.log("Restore nur lokal — nicht in der Cloud / nicht durch den Agent.");
  }
}

/** Safe metadata for the agent repo: token inventory without real values. */
function writeMetaSidecar(outDir, session, written) {
  if (!outDir) return;
  const outAbs = resolve(outDir);
  const tokens = Object.keys(session.map).sort();
  const meta = {
    generated: new Date().toISOString(),
    note:
      "Agent-safe metadata. Contains placeholder/pseudonym keys only — never real PII. " +
      "The real mapping lives only in the local key file (not in this folder).",
    tokenCount: tokens.length,
    tokens,
    files: written.map((w) => ({
      out: w.out ? relative(outAbs, w.out) : null,
      kind: w.kind,
      entities: w.entities,
    })),
  };
  writeText(resolve(outAbs, "ps-session-meta.json"), JSON.stringify(meta, null, 2) + "\n");
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
      "⚠ Key-Pfad wirkt nicht privat. Keys in secrets/ oder Vault legen — außerhalb des Agent-Repos."
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
