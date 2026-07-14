import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detect } from "../lib/detectors.js";
import { anonymizeString, restoreText } from "../lib/redact.js";
import { DEFAULT_ENABLED } from "../lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("detect — English", () => {
  const text = fixture("en-sample.txt");
  const spans = detect(text, DEFAULT_ENABLED, []);

  it("flags email, phone, SSN, case, address, money", () => {
    const types = new Set(spans.map((s) => s.type));
    for (const t of ["email", "phone", "ssn", "case", "address", "money", "name"]) {
      assert.ok(types.has(t), `expected type ${t}`);
    }
  });

  it("catches Hale and Fleming party names", () => {
    const vals = spans.map((s) => s.value);
    assert.ok(vals.some((v) => /Hale/.test(v)));
    assert.ok(vals.some((v) => /Fleming/.test(v)));
  });
});

describe("detect — German", () => {
  const text = fixture("de-sample.txt");
  const spans = detect(text, DEFAULT_ENABLED, []);

  it("flags email, phone, IBAN, DE address, Aktenzeichen, Euro amount", () => {
    const types = new Set(spans.map((s) => s.type));
    for (const t of ["email", "phone", "iban", "address", "case", "money", "name"]) {
      assert.ok(types.has(t), `expected type ${t}, got ${[...types].join(",")}`);
    }
  });

  it("handles umlaut names (Müller, Schäfer, König)", () => {
    const vals = spans.map((s) => s.value).join(" | ");
    assert.ok(/Müll?er/.test(vals), `Müller missing in: ${vals}`);
    assert.ok(/Schäfer|Schaefer/.test(vals), `Schäfer missing in: ${vals}`);
  });

  it("detects 'Müller gegen Schneider' party style", () => {
    const names = spans.filter((s) => s.type === "name" || s.type === "entity").map((s) => s.value);
    assert.ok(
      names.some((v) => /Schneider/.test(v)),
      `Schneider missing in: ${names.join(" | ")}`
    );
  });

  it("detects German date forms", () => {
    const dates = spans.filter((s) => s.type === "date").map((s) => s.value);
    assert.ok(
      dates.some((d) => /14\.\s*Juli\s*1982/i.test(d) || /1982/.test(d)),
      `expected DE date, got: ${dates.join(" | ")}`
    );
  });
});

describe("anonymize + restore roundtrip", () => {
  it("English roundtrip keeps meaning of placeholders", () => {
    const text = fixture("en-sample.txt");
    const r = anonymizeString(text);
    assert.ok(!r.text.includes("jane.hale@example.com"));
    assert.ok(r.text.includes("[EMAIL_"));
    const back = restoreText(r.text, r.map);
    assert.equal(back.text, text);
    assert.equal(back.leftover.length, 0);
  });

  it("German roundtrip restores umlauts and IBAN", () => {
    const text = fixture("de-sample.txt");
    const r = anonymizeString(text);
    assert.ok(!r.text.includes("anna.schaefer@beispiel.de"));
    assert.ok(!/DE89\s*3704/.test(r.text));
    const back = restoreText(r.text, r.map);
    assert.equal(back.text, text);
  });

  it("shares placeholders across a batch session", () => {
    const sessionMap = {};
    const counters = {};
    const existingByKey = {};
    const a = anonymizeString("Kontakt: Anna Schäfer, anna@x.de", {
      sessionMap,
      counters,
      existingByKey,
    });
    const b = anonymizeString("Rückfrage an Anna Schäfer bitte.", {
      sessionMap: a.sessionMap,
      counters: a.counters,
      existingByKey: a.existingByKey,
    });
    const ph = Object.entries(a.map).find(([, v]) => v.includes("Schäfer"))?.[0];
    assert.ok(ph, "expected Schäfer placeholder");
    assert.ok(b.text.includes(ph), `second file should reuse ${ph}: ${b.text}`);
  });

  it("honors custom terms (DE + EN)", () => {
    const text = "Die Müller GmbH kauft von Acme Corp.";
    const r = anonymizeString(text, { terms: ["Müller GmbH", "Acme Corp"] });
    assert.ok(r.text.includes("[TERM_"));
    assert.ok(!r.text.includes("Müller GmbH"));
    assert.ok(!r.text.includes("Acme Corp"));
  });
});
