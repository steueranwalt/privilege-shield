/**
 * Privilege Shield detectors — English + German.
 * Deliberately over-detect; humans / review still own the final call.
 * Pure offline — no network.
 */
import { TYPES } from "./types.js";

/* ---------------------------------------------------------------------------
   STOP / BOILERPLATE LEXICONS (EN + DE)
   --------------------------------------------------------------------------- */

const NAME_STOP = new Set((
  // EN months / days / articles
  "January February March April May June July August September October November December " +
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday " +
  "The A An And But Or For Of To In On At By With From As If He She They We You It This That These Those " +
  "See Cf Compare Accord Id Ibid Supra Infra See Also Cited Per Versus " +
  "Dear Sincerely Regards Best Re Subject Memo Memorandum Exhibit Attachment " +
  "Client Clients Witness Party Parties Matter " +
  "Court Supreme District Circuit County State States United Federal Department Office Bank Company " +
  "Corporation Inc Incorporated LLC LLP Co Ltd Plaintiff Defendant Petitioner Respondent Appellant " +
  "Attorney Counsel Law Firm Honorable Judge Justice North South East West New City America American " +
  "Street Avenue Road Boulevard Drive Lane Mr Mrs Ms Miss Dr Prof " +
  // DE months / days / articles / legal boilerplate
  "Januar Februar März Maerz April Mai Juni Juli August September Oktober November Dezember " +
  "Montag Dienstag Mittwoch Donnerstag Freitag Samstag Sonntag " +
  "Der Die Das Den Dem Des Ein Eine Einer Einem Einen Und Oder Aber Für Fuer Von Zu In An Auf Mit Aus Als Ob " +
  "Er Sie Es Wir Ihr Sie Siehst Sehen " +
  "Sehr Geehrte Geehrter Mit freundlichen Grüßen Grueßen Grüßen Gruss Hallo Betreff Anlage Anlagen Anlage " +
  "Mandant Mandantin Zeuge Zeugin Partei Parteien Sache Angelegenheit " +
  "Gericht Amtsgericht Landgericht Oberlandesgericht Bundesgerichtshof Arbeitsgericht " +
  "Bundesland Land Kreis Stadt Gemeinde Bundesrepublik Deutschland " +
  "Kläger Klaeger Klägerin Klaegerin Beklagter Beklagte Antragsteller Antragstellerin Antragsgegner Antragsgegnerin " +
  "Berufungskläger Berufungsklaeger Berufungsbeklagter " +
  "Rechtsanwalt Rechtsanwältin Rechtsanwaeltin Anwalt Anwältin Anwaeltin Notar Notarin " +
  "Richter Richterin Staatsanwalt Staatsanwältin Herr Frau Fräulein Fraeulein Dr Prof " +
  "Straße Strasse Str Weg Platz Allee Gasse Ring Chaussee"
).split(/\s+/).filter(Boolean));

const COMMON_CAP = new Set((
  "The A An And But Or Nor So Yet If When While Where Whereas Because Since As Although Though However Despite Whether Unless Until After Before During Once Meanwhile Moreover Furthermore Additionally Overall Instead Rather Otherwise " +
  "In On At To From With By Of Off Up Down Over Under Into Onto Per Via Plus Minus Throughout Among Between Against About Around Through Within Without " +
  "This That These Those It Its He She They We You I His Her Their Our My Your Them Us Him Me We " +
  "Then Thus Therefore Also There Here Now Later Next First Second Third Finally Still Even Just Only Both Either Neither Each Every All Most More Less Many Few Some Any No Not Such Other Another Same Several " +
  "Mr Mrs Ms Miss Dr Prof Re Dear Sincerely Regards Yes Ok Okay Please Thanks Thank Hi Hello Hey Note Per Despite Given " +
  // DE sentence starters / function words
  "Der Die Das Den Dem Des Ein Eine Einer Einem Einen Und Oder Aber Denn Weil Wenn Als Ob Obwohl Trotz Wegen Seit " +
  "In An Auf Aus Bei Mit Nach Von Zu Über Ueber Unter Durch Für Fuer Ohne Um Gegen " +
  "Dieser Diese Dieses Dieser Diese Diesen Diesem Dieser Diese " +
  "Er Sie Es Wir Ihr Sie Sein Seine Sein Sein Ihr Ihre Ihre " +
  "Dann Also Daher Deshalb Außerdem Ausserdem Jedoch Trotzdem Noch Nur Schon Auch Auch Auch " +
  "Sehr Geehrte Geehrter Hallo Betreff Anlage Bitte Danke Ja Nein Herr Frau Dr Prof " +
  "Hier Dort Nun Später Spaeter Zuerst Zweitens Drittens Schließlich Schliesslich"
).split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()));

const DE_MONTHS =
  "Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";
const EN_MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec";

/* Unicode “name word”: Müller, O'Brien, Jean-Luc, Schäfer */
const W = "\\p{Lu}[\\p{L}'’\\-]*";

/* ---------------------------------------------------------------------------
   REGEX DETECTORS
   --------------------------------------------------------------------------- */

export const REGEX_DETECTORS = [
  { type: "email", re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
  // US SSN
  { type: "ssn", re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
  // German tax id (IdNr / Steuer-ID): 11 digits, often spaced
  {
    type: "ssn",
    re: /\b(?:Steuer[- ]?(?:ID|Identifikationsnummer|IdNr\.?)|IdNr\.?)\s*[:#]?\s*\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/gi,
  },
  {
    type: "ssn",
    re: /\b\d{2}\s\d{3}\s\d{3}\s\d{3}\b/g,
    valid: (m) => (m.match(/\d/g) || []).length === 11,
  },
  // IBAN (DE + general)
  {
    type: "iban",
    re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}[ ]?[A-Z0-9]{0,4}\b/g,
    valid: (m) => {
      const compact = m.replace(/\s+/g, "");
      return compact.length >= 15 && compact.length <= 34;
    },
  },
  // Phone: US + DE (+49, 0xxx…, with spaces/dashes)
  {
    type: "phone",
    re: /(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g,
    valid: (m) => {
      const d = (m.match(/\d/g) || []).length;
      return d === 10 || d === 11;
    },
  },
  {
    type: "phone",
    re: /(?:\+49[\s.\-\/]?|0)(?:\(?\d{2,5}\)?[\s.\-\/]?)?\d{3,8}(?:[\s.\-\/]?\d{2,8}){0,3}\b/g,
    valid: (m) => {
      const d = (m.match(/\d/g) || []).length;
      return d >= 7 && d <= 15;
    },
  },
  // US case / docket
  { type: "case", re: /\b\d{1,2}:\d{2}-[A-Za-z]{2,4}-\d{3,6}\b/g },
  {
    type: "case",
    re: /\b(?:Case|Docket|Civil Action)\s*(?:No\.?|Number)?\s*[:#]?\s*[\dA-Za-z][\dA-Za-z\-:]{3,}\b/g,
  },
  // German Aktenzeichen: 12 C 345/24, 1 BvR 123/20, Az. …
  {
    type: "case",
    re: /\b(?:Az\.?|Aktenzeichen)\s*[:#]?\s*[\dA-Za-z][\dA-Za-z\.\/\-]{2,}\b/gi,
  },
  {
    type: "case",
    re: /\b\d{1,3}\s?[A-Za-z]{1,4}\s?\d{1,5}\/\d{2,4}\b/g,
  },
  {
    type: "case",
    re: /\b\d\s?[A-Za-z]{1,3}[A-Za-z]\s?\d{1,5}\/\d{2,4}\b/g,
  },
  // Money: $ / € / Euro / EUR
  {
    type: "money",
    re: /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:hundred|thousand|million|billion|trillion|bn|mn|[kmbt]))?\b/gi,
  },
  {
    type: "money",
    re: /\b\d[\d,]*(?:\.\d+)?\s?(?:hundred|thousand|million|billion|trillion)\s+dollars?\b/gi,
  },
  {
    type: "money",
    re: /(?:€|EUR)\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s?(?:€|EUR|Euro|Euros)\b/gi,
  },
  {
    type: "money",
    re: /\b\d{1,3}(?:\.\d{3})*,\d{2}\s?(?:€|EUR|Euro)?\b/g,
  },
  // Dates EN
  {
    type: "date",
    re: /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:\d{4}|\d{2})\b/g,
  },
  { type: "date", re: /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g },
  {
    type: "date",
    re: new RegExp(
      `\\b(?:${EN_MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
      "gi"
    ),
  },
  {
    type: "date",
    re: new RegExp(`\\b(?:${EN_MONTHS})\\.?\\s+(?:19|20)\\d{2}\\b`, "gi"),
  },
  { type: "date", re: /\b(?:19|20)\d{2}\s?(?:[-–—]|to)\s?(?:19|20)?\d{2}\b/g },
  { type: "date", re: /\b(?:19|20)\d{2}\b/g },
  // Dates DE: 14.07.2026 · 14. Juli 2026 · Juli 2026
  {
    type: "date",
    re: /\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}\b/g,
  },
  {
    type: "date",
    re: new RegExp(
      `\\b(?:0?[1-9]|[12]\\d|3[01])\\.\\s*(?:${DE_MONTHS})\\s+(?:19|20)\\d{2}\\b`,
      "gi"
    ),
  },
  {
    type: "date",
    re: new RegExp(`\\b(?:${DE_MONTHS})\\s+(?:19|20)\\d{2}\\b`, "gi"),
  },
  // Addresses EN
  {
    type: "address",
    re: /\b\d{1,6}\s+(?:[A-Z][A-Za-z.'\-]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Square|Sq|Trail|Trl)\b\.?(?:,?\s*(?:Apt|Suite|Ste|Unit|#)\s*\.?\s*[\w\-]+)?/g,
  },
  // Addresses DE: Musterstraße 12 · Musterstr. 12a · 10115 Berlin (street part)
  {
    type: "address",
    re: /\b(?:\p{Lu}[\p{L}'’.\-]+(?:straße|strasse|str\.?|weg|platz|allee|gasse|ring|chaussee|damm|ufer|steig|pfad))\s+\d{1,4}[a-zA-Z]?(?:\s*(?:Haus|Wohnung|Whg\.?|Apt\.?|Zi\.?)\s*[\w\-./]+)?/giu,
  },
  {
    type: "address",
    re: /\b\d{1,4}[a-zA-Z]?\s+(?:\p{Lu}[\p{L}'’.\-]+(?:straße|strasse|str\.?|weg|platz|allee|gasse|ring|chaussee|damm|ufer))\b/giu,
  },
  // Account / routing digits
  {
    type: "account",
    re: /\b\d(?:[\d\-\s]{5,})\d\b/g,
    valid: (m) => {
      const d = (m.match(/\d/g) || []).length;
      return d >= 7 && d <= 17;
    },
  },
  // ZIP US + PLZ DE (5 digits)
  { type: "zip", re: /\b\d{5}(?:-\d{4})?\b/g },
];

/* ---------------------------------------------------------------------------
   NAME / ENTITY / TERMS
   --------------------------------------------------------------------------- */

function trimStops(matchStr, absStart) {
  let s = absStart;
  let e = absStart + matchStr.length;
  let toks = matchStr.split(/\s+/);
  while (toks.length && NAME_STOP.has(toks[0].replace(/\.$/, ""))) {
    s += toks[0].length + 1;
    toks.shift();
  }
  while (toks.length && NAME_STOP.has(toks[toks.length - 1].replace(/\.$/, ""))) {
    e -= toks[toks.length - 1].length + 1;
    toks.pop();
  }
  return toks.length ? { s, e, n: toks.length } : null;
}

/** Titles + "X v. Y" / "X gegen Y" + capitalized runs (Unicode). */
export function detectNames(text) {
  const spans = [];
  const push = (start, end) => {
    if (end > start) spans.push({ type: "name", start, end, value: text.slice(start, end) });
  };

  const titleRe = new RegExp(
    `\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Atty|Hon|Judge|Justice|Officer|Det|Sgt|Capt|Lt|Col|Gen|Rev|` +
      `Herr|Frau|Fräulein|Fraeulein|RA|RAin|StA|Notar(?:in)?|Richter(?:in)?)\\.?\\s+` +
      `${W}(?:\\s+(?:\\p{Lu}\\.?|${W})){0,2}`,
    "gu"
  );
  for (let m; (m = titleRe.exec(text)); ) push(m.index, m.index + m[0].length);

  // EN "v./vs." and DE "gegen" / " ./. "
  const vRe = new RegExp(
    `\\b(${W}(?:\\s+${W}){0,3})\\s+(?:v\\.?|vs\\.?|gegen|\\.?\\/\\.?)\\s+(${W}(?:\\s+${W}){0,3})`,
    "gu"
  );
  for (let m; (m = vRe.exec(text)); ) {
    const L = trimStops(m[1], m.index);
    if (L) push(L.s, L.e);
    const R = trimStops(m[2], m.index + m[0].length - m[2].length);
    if (R) push(R.s, R.e);
  }

  const genRe = new RegExp(`\\b${W}(?:\\s+(?:\\p{Lu}\\.?|${W})){1,3}\\b`, "gu");
  for (let m; (m = genRe.exec(text)); ) {
    const t = trimStops(m[0], m.index);
    if (t && t.n >= 2) push(t.s, t.e);
  }
  return spans;
}

export function detectEntities(text) {
  const spans = [];
  const re = /\p{Lu}[\p{L}\p{N}&'’\-]*(?:\s+\p{Lu}[\p{L}\p{N}&'’\-]*)*/gu;
  for (let m; (m = re.exec(text)); ) {
    let start = m.index;
    let end = start + m[0].length;
    let toks = m[0].split(/\s+/);
    const before = text.slice(0, start);
    const sentInit = /(?:^|[.!?:;]\s*|\n\s*|["'(‘“„]\s*)$/.test(before);
    if (sentInit) {
      while (
        toks.length &&
        COMMON_CAP.has(toks[0].toLowerCase().replace(/[.'’\-]+$/u, ""))
      ) {
        start += toks[0].length + 1;
        toks.shift();
      }
    }
    if (!toks.length) continue;
    if (toks.length === 1 && toks[0].replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
    spans.push({ type: "entity", start, end, value: text.slice(start, end) });
  }
  return spans;
}

export function detectTerms(text, terms) {
  const spans = [];
  for (const raw of terms) {
    const t = raw.trim();
    if (!t) continue;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re;
    try {
      re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "giu");
    } catch {
      re = new RegExp(esc, "gi");
    }
    for (let m; (m = re.exec(text)); ) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      spans.push({
        type: "term",
        start: m.index,
        end: m.index + m[0].length,
        value: m[0],
        gkey: "term:" + t.toLowerCase(),
        display: t,
      });
    }
  }
  return spans;
}

export function linkNameParts(text, spans) {
  const SUFFIX =
    /^(LLC|Inc|Incorporated|Corp|Corporation|LLP|PLLC|PC|LP|Co|Company|Ltd|Trust|Partners|Group|Associates|Holdings|Ventures|Capital|Foundation|Bancorp|Bank|Insurance|GmbH|AG|UG|e\.?V\.?|OHG|KG|GbR|SE|mbH)$/iu;
  const tokenType = new Map();
  for (const s of spans) {
    if (s.type !== "name" && s.type !== "entity") continue;
    for (const raw of s.value.split(/\s+/)) {
      const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (
        t.length >= 3 &&
        /^\p{Lu}/u.test(t) &&
        !NAME_STOP.has(t.replace(/\.$/, "")) &&
        !SUFFIX.test(t)
      ) {
        if (!tokenType.has(t) || s.type === "name") tokenType.set(t, s.type);
      }
    }
  }
  const out = [];
  for (const [t, type] of tokenType) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gu");
    for (let m; (m = re.exec(text)); ) {
      const st = m.index;
      const en = st + m[0].length;
      if (spans.some((sp) => st < sp.end && en > sp.start)) continue;
      if (out.some((sp) => st < sp.end && en > sp.start)) continue;
      out.push({ type, start: st, end: en, value: m[0] });
    }
  }
  return out;
}

export function resolveOverlaps(spans) {
  spans.sort(
    (a, b) =>
      TYPES[b.type].priority - TYPES[a.type].priority ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start
  );
  const kept = [];
  for (const s of spans) {
    if (kept.some((k) => s.start < k.end && s.end > k.start)) continue;
    kept.push(s);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/**
 * @param {string} text
 * @param {Record<string, boolean>} enabled
 * @param {string[]} [terms]
 */
export function detect(text, enabled, terms = []) {
  let spans = [];
  for (const d of REGEX_DETECTORS) {
    if (!enabled[d.type]) continue;
    d.re.lastIndex = 0;
    for (let m; (m = d.re.exec(text)); ) {
      const v = m[0];
      if (d.valid && !d.valid(v)) continue;
      spans.push({ type: d.type, start: m.index, end: m.index + v.length, value: v });
    }
  }
  if (enabled.entity) spans = spans.concat(detectEntities(text));
  if (enabled.name) spans = spans.concat(detectNames(text));
  if (enabled.name || enabled.entity) spans = spans.concat(linkNameParts(text, spans));
  if (terms && terms.length) spans = spans.concat(detectTerms(text, terms));
  return resolveOverlaps(spans);
}
