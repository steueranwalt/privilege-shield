import { TYPES, DEFAULT_ENABLED } from "./types.js";
import { detect } from "./detectors.js";

/**
 * Group spans by (type + value) so identical values share one placeholder.
 * Session counters can be passed so batch runs keep stable IDs across files.
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
        placeholder: null,
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
 * Assign placeholders using a shared counter map so batch sessions stay consistent.
 * @param {object[]} items
 * @param {Record<string, number>} counters  mutated
 * @param {Record<string, string>} existingByKey  key → placeholder already assigned
 */
export function assignPlaceholders(items, counters = {}, existingByKey = {}) {
  for (const it of items) {
    if (!it.enabled) {
      it.placeholder = null;
      continue;
    }
    if (existingByKey[it.key]) {
      it.placeholder = existingByKey[it.key];
      continue;
    }
    counters[it.type] = (counters[it.type] || 0) + 1;
    it.placeholder = "[" + TYPES[it.type].prefix + "_" + counters[it.type] + "]";
    existingByKey[it.key] = it.placeholder;
  }
  return { counters, existingByKey };
}

/** Apply placeholders left-to-right; return { text, map }. */
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

/** Restore placeholders using a map (longest-first). */
export function restoreText(text, map) {
  let out = text;
  const phs = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const ph of phs) out = out.split(ph).join(map[ph]);
  const leftover = [...new Set(out.match(/\[[A-Z]+_\d+\]/g) || [])];
  return { text: out, leftover };
}

/**
 * Full pass on one document string.
 * @param {string} text
 * @param {object} options
 * @param {Record<string, boolean>} [options.enabled]
 * @param {string[]} [options.terms]
 * @param {Record<string, number>} [options.counters]
 * @param {Record<string, string>} [options.existingByKey]
 * @param {Record<string, string>} [options.sessionMap] placeholder → value
 */
export function anonymizeString(text, options = {}) {
  const enabled = { ...DEFAULT_ENABLED, ...(options.enabled || {}) };
  const terms = options.terms || [];
  const counters = options.counters || {};
  const existingByKey = options.existingByKey || {};
  const sessionMap = options.sessionMap || {};
  const itemSeqRef = options.itemSeqRef || { n: 0 };

  const spans = detect(text, enabled, terms);
  const items = regroup(spans, null, itemSeqRef);
  assignPlaceholders(items, counters, existingByKey);
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
