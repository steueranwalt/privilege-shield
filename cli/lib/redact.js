import { DEFAULT_ENABLED, TYPES } from "./types.js";
import { detect } from "./detectors.js";
import { suggestPseudonym, uniquifyPseudo } from "./pseudos.js";

/**
 * Group spans by (type + value) so identical values share one pseudonym.
 */
export function regroup(spans, prevItems = null, itemSeqRef = { n: 0 }) {
  const prevEnabled = {};
  if (prevItems) prevItems.forEach((it) => (prevEnabled[it.key] = it.enabled));
  const byKey = new Map();
  for (const s of spans) {
    const key = s.gkey || s.type + " " + s.value.trim();
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: "it" + itemSeqRef.n++,
        type: s.type,
        value: (s.display || s.value).trim(),
        key,
        enabled: key in prevEnabled ? prevEnabled[key] : true,
        placeholder: null, // holds the pseudonym string
        occ: [],
      });
    }
    byKey.get(key).occ.push({ start: s.start, end: s.end });
  }
  const out = [...byKey.values()];
  out.sort(
    (a, b) =>
      Math.min(...a.occ.map((o) => o.start)) - Math.min(...b.occ.map((o) => o.start))
  );
  return out;
}

/**
 * Assign pseudonyms (not [TYPE_N] placeholders).
 * existingByKey: detection key → already chosen pseudonym
 * sessionMap: pseudonym → real value
 * overrides: optional key → pseudonym|null (null = skip / keep cleartext)
 */
export function assignPseudonyms(
  items,
  {
    counters = {},
    existingByKey = {},
    sessionMap = {},
    overrides = null,
    style = "pseudo", // "pseudo" | "placeholders"
  } = {}
) {
  for (const it of items) {
    if (!it.enabled) {
      it.placeholder = null;
      continue;
    }

    if (overrides && Object.prototype.hasOwnProperty.call(overrides, it.key)) {
      const chosen = overrides[it.key];
      if (chosen == null) {
        it.enabled = false;
        it.placeholder = null;
        continue;
      }
      const unique = uniquifyPseudo(chosen, sessionMap);
      it.placeholder = unique;
      existingByKey[it.key] = unique;
      sessionMap[unique] = it.value;
      continue;
    }

    if (existingByKey[it.key]) {
      it.placeholder = existingByKey[it.key];
      sessionMap[it.placeholder] = it.value;
      continue;
    }

    let pseudo;
    if (style === "placeholders") {
      counters[it.type] = (counters[it.type] || 0) + 1;
      pseudo = "[" + TYPES[it.type].prefix + "_" + counters[it.type] + "]";
    } else {
      // Dates must never be altered (safety net even if date detection is on)
      if (it.type === "date") {
        it.enabled = false;
        it.placeholder = null;
        continue;
      }
      pseudo = uniquifyPseudo(suggestPseudonym(it.type, it.value, counters), sessionMap);
    }

    it.placeholder = pseudo;
    existingByKey[it.key] = pseudo;
    sessionMap[pseudo] = it.value;
  }
  return { counters, existingByKey, sessionMap };
}

/** Apply pseudonyms left-to-right; return { text, map }. */
export function redactText(text, items) {
  const enabledItems = items.filter((i) => i.enabled && i.placeholder);
  const occ = [];
  for (const it of enabledItems) {
    for (const o of it.occ) occ.push({ start: o.start, end: o.end, ph: it.placeholder });
  }
  occ.sort((a, b) => a.start - b.start);

  let out = "";
  let cur = 0;
  for (const o of occ) {
    if (o.start < cur) continue;
    out += text.slice(cur, o.start) + o.ph;
    cur = o.end;
  }
  out += text.slice(cur);

  const map = {};
  for (const it of enabledItems) map[it.placeholder] = it.value;
  return { text: out, map };
}

/** Restore pseudonyms using map (pseudo → real), longest-first. */
export function restoreText(text, map) {
  let out = text;
  const phs = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const ph of phs) out = out.split(ph).join(map[ph]);
  const leftover = [...new Set(out.match(/\[[A-Z]+_\d+\]/g) || [])];
  return { text: out, leftover };
}

/** Detect + regroup only (no assignment yet) — for prior interactive query. */
export function collectItems(text, options = {}) {
  const enabled = { ...DEFAULT_ENABLED, ...(options.enabled || {}) };
  // Hard rule: dates stay unless explicitly enabled
  if (options.enabled?.date !== true) enabled.date = false;
  const terms = options.terms || [];
  const itemSeqRef = options.itemSeqRef || { n: 0 };
  const spans = detect(text, enabled, terms);
  const items = regroup(spans, null, itemSeqRef);
  return { items, enabled, itemSeqRef };
}

/**
 * Full pass on one document string.
 * options.overrides: key → pseudonym|null for novel items
 * options.style: "pseudo" (default) | "placeholders"
 */
export function anonymizeString(text, options = {}) {
  const { items, itemSeqRef } = collectItems(text, options);
  const counters = options.counters || {};
  const existingByKey = options.existingByKey || {};
  const sessionMap = options.sessionMap || {};
  const style = options.style || "pseudo";

  assignPseudonyms(items, {
    counters,
    existingByKey,
    sessionMap,
    overrides: options.overrides || null,
    style,
  });

  const { text: redacted, map } = redactText(text, items);
  Object.assign(sessionMap, map);

  return {
    text: redacted,
    map: { ...sessionMap },
    items,
    stats: summarize(items),
    counters,
    existingByKey,
    sessionMap,
    itemSeqRef,
  };
}

/**
 * Build pending list of novel entities across many files for interactive prompt.
 */
export function collectPendingAcrossFiles(fileTexts, options = {}) {
  const counters = options.counters || {};
  const existingByKey = options.existingByKey || {};
  const sessionMap = options.sessionMap || {};
  const itemSeqRef = options.itemSeqRef || { n: 0 };
  const style = options.style || "pseudo";
  const pending = [];
  const seen = new Set(Object.keys(existingByKey));

  for (const { file, text } of fileTexts) {
    const { items } = collectItems(text, { ...options, itemSeqRef });
    for (const it of items) {
      if (!it.enabled) continue;
      if (it.type === "date") continue;
      if (seen.has(it.key) || existingByKey[it.key]) continue;
      seen.add(it.key);
      let suggestion;
      if (style === "placeholders") {
        counters[it.type] = (counters[it.type] || 0) + 1;
        suggestion = "[" + TYPES[it.type].prefix + "_" + counters[it.type] + "]";
      } else {
        suggestion = suggestPseudonym(it.type, it.value, counters);
      }
      pending.push({
        key: it.key,
        type: it.type,
        value: it.value,
        suggestion,
        file,
      });
    }
  }

  return { pending, counters, itemSeqRef };
}

function summarize(items) {
  const byType = {};
  let enabled = 0;
  for (const it of items) {
    if (!it.enabled) continue;
    enabled++;
    byType[it.type] = (byType[it.type] || 0) + 1;
  }
  return { entities: enabled, byType };
}
