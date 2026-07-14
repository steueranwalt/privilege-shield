import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, dirname, extname, resolve } from "node:path";

const TEXT_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".rtf",
  ".log",
]);

export function isTextPath(p) {
  return TEXT_EXTS.has(extname(p).toLowerCase());
}

/** Expand file/dir args into a flat list of text files. */
export function collectInputs(paths, { recursive = true } = {}) {
  const out = [];
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) throw new Error(`Path not found: ${p}`);
    const st = statSync(abs);
    if (st.isFile()) {
      if (isTextPath(abs)) out.push(abs);
      else console.warn(`Skipping non-text file: ${p}`);
    } else if (st.isDirectory()) {
      walk(abs, out, recursive);
    }
  }
  return [...new Set(out)].sort();
}

function walk(dir, out, recursive) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (recursive) walk(full, out, recursive);
    } else if (isTextPath(full)) {
      out.push(full);
    }
  }
}

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

/**
 * Map an input file to an output path under outDir, preserving relative structure
 * when a common root is known.
 */
export function mapOutputPath(inputAbs, outDir, rootAbs, suffix = "") {
  const rel = rootAbs ? relative(rootAbs, inputAbs) : inputAbs.split(/[/\\]/).pop();
  const ext = extname(rel);
  const base = rel.slice(0, rel.length - ext.length);
  return join(resolve(outDir), base + suffix + ext);
}

export function commonRoot(files) {
  if (!files.length) return null;
  if (files.length === 1) return dirname(files[0]);
  const parts = files.map((f) => f.split(/[/\\]/));
  const minLen = Math.min(...parts.map((p) => p.length));
  const shared = [];
  for (let i = 0; i < minLen; i++) {
    const seg = parts[0][i];
    if (parts.every((p) => p[i] === seg)) shared.push(seg);
    else break;
  }
  // drop last segment if it's a filename shared across nothing — keep dir only
  if (shared.length && files.every((f) => f !== shared.join("/"))) {
    // if shared path is a file path common prefix dirs only
  }
  const root = shared.join("/") || "/";
  // ensure root is a directory containing all files
  if (files.every((f) => f === root || f.startsWith(root + "/"))) return root;
  return dirname(files[0]);
}

export function parseTermsArg(str) {
  if (!str) return [];
  return [...new Set(str.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))];
}

export function loadTermsFile(path) {
  if (!path) return [];
  return parseTermsArg(readFileSync(path, "utf8"));
}

/**
 * Load a predeclared real→pseudonym map.
 * Accepts JSON `{ "Real Name": "Alex Berner", ... }` or text lines:
 *   Real Name => Alex Berner
 *   Real Name = Alex Berner
 * Returns { byReal: Map-like object, overrides for engine keys filled later }.
 */
export function loadMapFile(path) {
  if (!path) return {};
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.map && typeof obj.map === "object") {
      // key-file style (pseudo → real) — invert
      const inv = {};
      for (const [pseudo, real] of Object.entries(obj.map)) inv[real] = pseudo;
      return inv;
    }
    return obj;
  }
  const out = {};
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.split(/\s*=>\s*|\s*=\s*/);
    if (m.length >= 2) {
      const real = m[0].trim();
      const pseudo = m.slice(1).join("=").trim();
      if (real && pseudo) out[real] = pseudo;
    }
  }
  return out;
}
