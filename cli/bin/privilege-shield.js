#!/usr/bin/env node
/**
 * Privilege Shield CLI — local batch anonymize / deanonymize (EN + DE).
 * Never uploads documents. Keep the key file offline and out of git.
 */
import { resolve, relative } from "node:path";
import { anonymizeString, restoreText } from "../lib/redact.js";
import { createEmptySession, loadSession, saveSession } from "../lib/session.js";
import {
  collectInputs,
  readText,
  writeText,
  mapOutputPath,
  commonRoot,
  parseTermsArg,
  loadTermsFile,
} from "../lib/io.js";
import { DEFAULT_ENABLED, TOGGLEABLE } from "../lib/types.js";

const HELP = `
Privilege Shield CLI — local batch pseudonymization (English + German)

USAGE
  privilege-shield anonymize <files|dirs...> --out <dir> --key <key.json> [options]
  privilege-shield deanonymize <files|dirs...> --out <dir> --key <key.json>
  privilege-shield scan <files|dirs...> [options]

OPTIONS
  --out, -o <dir>       Output directory (required for anonymize/deanonymize)
  --key, -k <file>      Session key JSON (required; created on anonymize)
  --terms <a,b,c>       Extra terms to always redact
  --terms-file <path>   File with terms (comma or newline separated)
  --disable <types>     Comma-separated types to skip: ${TOGGLEABLE.join(",")}
  --suffix <str>        Output filename suffix (default: .redacted / .restored)
  --dry-run             Scan/report only; do not write outputs
  --json                Machine-readable summary on stdout
  -h, --help            Show help

TRUST MODEL
  • Runs offline on your machine. No network calls.
  • The key file maps placeholders → real values. Treat it as a secret.
  • Never commit keys or cleartext client docs to a repo a Cursor cloud agent will clone.
  • Put only redacted outputs in repos the agent can access; restore locally with --key.

EXAMPLES
  # Batch redaction (shared placeholders across files)
  privilege-shield anonymize ./inbox/ --out ./redacted/ --key ./secrets/ps-key.json

  # German + English mixed corpus + custom party names
  privilege-shield anonymize ./akten/*.txt --out ./safe/ --key ./secrets/key.json \\
    --terms "Müller GmbH,Acme Corp"

  # Restore AI output / redacted drafts
  privilege-shield deanonymize ./safe/ --out ./restored/ --key ./secrets/ps-key.json

  # Preview detections without writing
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
    disable: [],
    suffix: null,
    dryRun: false,
    json: false,
    help: false,
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
    else if (x === "--disable") args.disable = (a.shift() || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (x === "--suffix") args.suffix = a.shift();
    else if (x === "--dry-run") args.dryRun = true;
    else if (x === "--json") args.json = true;
    else if (x.startsWith("-")) die(`Unknown option: ${x}\n\n${HELP}`);
    else args.paths.push(x);
  }
  return args;
}

function enabledFromDisable(disable) {
  const enabled = { ...DEFAULT_ENABLED };
  for (const t of disable) {
    if (!(t in enabled) && !TOGGLEABLE.includes(t)) {
      die(`Unknown type in --disable: ${t}\nKnown: ${TOGGLEABLE.join(", ")}`);
    }
    enabled[t] = false;
  }
  return enabled;
}

function cmdScan(args) {
  if (!args.paths.length) die("scan: provide at least one file or directory");
  const files = collectInputs(args.paths);
  if (!files.length) die("scan: no text files found");
  const terms = [...args.terms, ...loadTermsFile(args.termsFile)];
  const enabled = enabledFromDisable(args.disable);
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
    });
    session.counters = r.counters;
    session.byKey = r.existingByKey;
    session.map = r.sessionMap;
    results.push({
      file,
      entities: r.stats.entities,
      byType: r.stats.byType,
      sample: r.items.slice(0, 20).map((it) => ({
        type: it.type,
        value: it.value,
        placeholder: it.placeholder,
        occurrences: it.occ.length,
      })),
    });
  }

  const summary = {
    files: results.length,
    uniquePlaceholders: Object.keys(session.map).length,
    results,
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Scanned ${summary.files} file(s); ${summary.uniquePlaceholders} unique placeholder(s).\n`);
    for (const r of results) {
      console.log(`• ${r.file}`);
      console.log(`  ${r.entities} item(s): ${fmtByType(r.byType)}`);
      for (const s of r.sample.slice(0, 8)) {
        console.log(`    [${s.type}] ${JSON.stringify(s.value)} → ${s.placeholder}`);
      }
      if (r.sample.length > 8) console.log(`    … +${r.sample.length - 8} more in sample`);
    }
    console.log("\nReview carefully — detectors over-flag and can miss. No files written.");
  }
}

function cmdAnonymize(args) {
  if (!args.paths.length) die("anonymize: provide at least one file or directory");
  if (!args.key) die("anonymize: --key <file> is required");
  if (!args.out && !args.dryRun) die("anonymize: --out <dir> is required (or use --dry-run)");
  const files = collectInputs(args.paths);
  if (!files.length) die("anonymize: no text files found");

  const keyPath = resolve(args.key);
  let session;
  try {
    session = loadSession(keyPath);
    console.error(`Loaded existing key: ${keyPath}`);
  } catch {
    session = createEmptySession();
  }

  const terms = [...args.terms, ...loadTermsFile(args.termsFile)];
  const enabled = enabledFromDisable(args.disable);
  const root = commonRoot(files);
  const suffix = args.suffix != null ? args.suffix : ".redacted";
  const written = [];

  for (const file of files) {
    const text = readText(file);
    const r = anonymizeString(text, {
      enabled,
      terms,
      counters: session.counters,
      existingByKey: session.byKey,
      sessionMap: session.map,
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
    uniquePlaceholders: Object.keys(session.map).length,
    key: keyPath,
    out: args.out ? resolve(args.out) : null,
    written,
  };

  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `Anonymized ${summary.files} file(s) → ${summary.uniquePlaceholders} unique placeholder(s).`
    );
    for (const w of written) {
      const rel = w.out ? relative(process.cwd(), w.out) : "(dry-run)";
      console.log(`  ${relative(process.cwd(), w.in)} → ${rel}  (${w.entities} items)`);
    }
    if (!args.dryRun) {
      console.log(`\nKey saved to ${keyPath}`);
      console.log("Keep this key offline. Commit only redacted outputs — never the key or cleartext.");
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
      // Prefer turning foo.redacted.txt → foo.txt (or foo.restored.txt if suffix set)
      const cleanInput = file.replace(/\.redacted(?=\.[^./]+$)/, "");
      const useSuffix = args.suffix != null ? suffix : "";
      outPath = mapOutputPath(cleanInput, args.out, root, useSuffix);
      writeText(outPath, restored);
    }
    written.push({
      in: file,
      out: outPath,
      leftover,
    });
  }

  const summary = { files: written.length, key: resolve(args.key), written };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Restored ${summary.files} file(s) with ${Object.keys(session.map).length} mapping(s).`);
    for (const w of written) {
      console.log(
        `  ${relative(process.cwd(), w.in)} → ${w.out ? relative(process.cwd(), w.out) : "(dry-run)"}`
      );
      if (w.leftover.length) {
        console.warn(`    ⚠ unmatched placeholders: ${w.leftover.join(", ")}`);
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
      "⚠ Key path does not look private (no 'secret'/'private'/'vault' in path). " +
        "Store keys outside the git tree the agent clones."
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd) {
    console.log(HELP);
    process.exit(args.help || !args.cmd ? 0 : 1);
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

main();
