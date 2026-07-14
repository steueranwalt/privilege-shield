import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const KEY_VERSION = 1;

export function createEmptySession() {
  return {
    version: KEY_VERSION,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    map: {}, // placeholder → real value
    // internal consistency helpers (safe to persist; no extra PII beyond map)
    counters: {},
    byKey: {}, // detection key → placeholder
  };
}

export function loadSession(path) {
  if (!existsSync(path)) {
    throw new Error(`Key/session file not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || typeof raw.map !== "object") {
    throw new Error(`Invalid key file (expected { map: {...} }): ${path}`);
  }
  return {
    version: raw.version || KEY_VERSION,
    created: raw.created || new Date().toISOString(),
    updated: raw.updated || new Date().toISOString(),
    map: { ...raw.map },
    counters: { ...(raw.counters || {}) },
    byKey: { ...(raw.byKey || {}) },
  };
}

export function saveSession(path, session) {
  mkdirSync(dirname(path), { recursive: true });
  const out = {
    version: KEY_VERSION,
    created: session.created || new Date().toISOString(),
    updated: new Date().toISOString(),
    map: session.map,
    counters: session.counters || {},
    byKey: session.byKey || {},
    warning:
      "LOCAL SECRET — never commit, upload, or paste this file into an AI tool. " +
      "It maps placeholders back to real identifiers.",
  };
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf8");
}

/** Invert placeholder→value into value→placeholder for reporting. */
export function invertMap(map) {
  const inv = {};
  for (const [ph, val] of Object.entries(map)) inv[val] = ph;
  return inv;
}
