/**
 * Generate realistic DE/CH-style pseudonyms (not bracket placeholders).
 * Offline only — deterministic per session via counters.
 */

const FIRST = [
  "Alex", "Sara", "Tobias", "Nina", "Lukas", "Elena", "Marc", "Julia",
  "Simon", "Laura", "Jonas", "Miriam", "David", "Anna", "Peter", "Klara",
];
const LAST = [
  "Berner", "Keller", "Frei", "Steiner", "Bachmann", "Widmer", "Graf",
  "Zimmermann", "Meier", "Hug", "Brunner", "Weber", "Sutter", "Roth",
];
const STREETS = [
  "Bergweg", "Seestrasse", "Bahnhofstrasse", "Lindenweg", "Rosenweg",
  "Kirchgasse", "Parkallee", "Sonnenweg",
];
const CITIES = ["Bern", "Zürich", "Basel", "Luzern", "St. Gallen", "Winterthur"];

function nextCounter(counters, key) {
  counters[key] = (counters[key] || 0) + 1;
  return counters[key];
}

/** Suggest a typed pseudonym; may be overridden interactively. */
export function suggestPseudonym(type, value, counters = {}) {
  const n = nextCounter(counters, "pseudo_" + type);
  switch (type) {
    case "name":
    case "entity":
    case "term":
    case "other": {
      const first = FIRST[(n - 1) % FIRST.length];
      const last = LAST[(n - 1) % LAST.length];
      // Keep single-token vs multi-token shape roughly
      const parts = String(value).trim().split(/\s+/);
      if (parts.length === 1) return last + (n > LAST.length ? String(n) : "");
      return `${first} ${last}`;
    }
    case "email": {
      const local = `person${n}`;
      return `${local}@beispiel.ch`;
    }
    case "phone": {
      // CH-style +41
      const base = String(2000000 + n).padStart(7, "0");
      return `+41 79 ${base.slice(0, 3)} ${base.slice(3)}`;
    }
    case "iban": {
      // Pseudonymous CH IBAN shape (not a real checksum — for redaction only)
      const body = String(100000000000000000 + n).slice(0, 17);
      return `CH93 0076 2011 ${body.slice(0, 4)} ${body.slice(4, 8)} ${body.slice(8, 9)}`;
    }
    case "ssn": {
      return `000.00${String(1000 + n).slice(-3)}.${String(100 + n).slice(-3)}`;
    }
    case "address": {
      const street = STREETS[(n - 1) % STREETS.length];
      return `${street} ${10 + (n % 80)}`;
    }
    case "zip": {
      return String(8000 + (n % 900));
    }
    case "case": {
      return `Az. ${n} PS ${100 + n}/26`;
    }
    case "account": {
      return String(10000000 + n);
    }
    case "money": {
      // Preserve currency cue when possible; change the numeric part
      const v = String(value);
      if (/CHF|Fr\.?/i.test(v)) return `CHF ${(1000 + n * 25).toFixed(2)}`;
      if (/€|EUR|Euro/i.test(v)) return `${(1000 + n * 25).toFixed(2).replace(".", ",")} €`;
      if (/\$/.test(v)) return `$${(1000 + n * 25).toFixed(2)}`;
      return `CHF ${(1000 + n * 25).toFixed(2)}`;
    }
    case "date":
      // Dates are kept by default; if ever enabled, keep original
      return value;
    default:
      return `Pseudonym_${n}`;
  }
}

/**
 * Ensure uniqueness of assigned pseudonyms within the session map
 * (pseudo → real). If collision, append a numeric suffix.
 */
export function uniquifyPseudo(pseudo, sessionMap, n = 1) {
  const used = new Set(Object.keys(sessionMap));
  if (!used.has(pseudo)) return pseudo;
  const candidate = `${pseudo} (${n + 1})`;
  if (!used.has(candidate)) return candidate;
  return uniquifyPseudo(pseudo, sessionMap, n + 1);
}
