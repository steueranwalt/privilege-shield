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

  it("does not flag dates by default", () => {
    assert.ok(!spans.some((s) => s.type === "date"));
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

  it("handles umlaut names (Müller, Schäfer)", () => {
    const vals = spans.map((s) => s.value).join(" | ");
    assert.ok(/Müll?er/.test(vals), `Müller missing in: ${vals}`);
    assert.ok(/Schäfer|Schaefer/.test(vals), `Schäfer missing in: ${vals}`);
  });
});

describe("detect — Swiss German", () => {
  const text = fixture("ch-sample.txt");
  const spans = detect(text, DEFAULT_ENABLED, []);

  it("flags CHF / Fr. amounts, +41 phone, CH IBAN", () => {
    const types = new Set(spans.map((s) => s.type));
    assert.ok(types.has("money"), `money missing: ${[...types]}`);
    assert.ok(types.has("phone"), `phone missing`);
    assert.ok(types.has("iban"), `iban missing`);
    const money = spans.filter((s) => s.type === "money").map((s) => s.value);
    assert.ok(
      money.some((m) => /CHF|Fr\.?/i.test(m)),
      `expected CHF/Fr in ${money.join(" | ")}`
    );
  });

  it("keeps Verfahrensrollen as labels (not as the only name hit)", () => {
    const roleOnly = spans.filter(
      (s) =>
        /^(Beschwerdeführer|Beschwerdegegnerin|Steuerpflichtiger|Einspruchsführer)$/i.test(
          s.value.trim()
        )
    );
    assert.equal(
      roleOnly.length,
      0,
      `roles should not be redacted as entities: ${roleOnly.map((s) => s.value)}`
    );
  });

  it("can recognize CH date forms when date detection is enabled", () => {
    const withDates = detect(text, { ...DEFAULT_ENABLED, date: true }, []);
    const dates = withDates.filter((s) => s.type === "date").map((s) => s.value);
    assert.ok(
      dates.some((d) => /^1\.3\.2024$/.test(d) || /1\.\s*3\.\s*2024/.test(d)),
      `expected T.M.JJJJ, got: ${dates.join(" | ")}`
    );
    assert.ok(
      dates.some((d) => /14\.07\.2023/.test(d)),
      `expected TT.MM.JJJJ, got: ${dates.join(" | ")}`
    );
  });
});

describe("anonymize + restore — pseudonyms, dates intact", () => {
  it("English roundtrip with pseudonyms (not [EMAIL_n])", () => {
    const text = fixture("en-sample.txt");
    const r = anonymizeString(text);
    assert.ok(!r.text.includes("jane.hale@example.com"));
    assert.ok(!/\[EMAIL_\d+\]/.test(r.text), "should use pseudonyms by default");
    assert.ok(r.text.includes("@beispiel.ch") || /person\d+@/.test(r.text));
    const back = restoreText(r.text, r.map);
    assert.equal(back.text, text);
  });

  it("leaves dates untouched (DE/CH forms)", () => {
    const text = fixture("ch-sample.txt");
    const r = anonymizeString(text);
    assert.ok(r.text.includes("1.3.2024"), "T.M.JJJJ must remain");
    assert.ok(r.text.includes("14.07.2023"), "TT.MM.JJJJ must remain");
    assert.ok(!r.stats.byType.date, "no date redactions in stats");
  });

  it("German roundtrip restores umlauts and IBAN", () => {
    const text = fixture("de-sample.txt");
    const r = anonymizeString(text);
    assert.ok(!r.text.includes("anna.schaefer@beispiel.de"));
    assert.ok(!/DE89\s*3704/.test(r.text));
    assert.ok(r.text.includes("14. Juli 1982"), "named DE date must remain");
    const back = restoreText(r.text, r.map);
    assert.equal(back.text, text);
  });

  it("shares pseudonyms across a batch session", () => {
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
    assert.ok(ph, "expected Schäfer pseudonym");
    assert.ok(b.text.includes(ph), `second file should reuse ${ph}: ${b.text}`);
  });

  it("honors custom terms (DE + EN)", () => {
    const text = "Die Müller GmbH kauft von Acme Corp.";
    const r = anonymizeString(text, { terms: ["Müller GmbH", "Acme Corp"] });
    assert.ok(!r.text.includes("Müller GmbH"));
    assert.ok(!r.text.includes("Acme Corp"));
  });

  it("keeps role labels next to pseudonymized names", () => {
    const text = "Der Beschwerdeführer Klaus Müller stellt Antrag.";
    const r = anonymizeString(text);
    assert.ok(r.text.includes("Beschwerdeführer"), `role stripped: ${r.text}`);
    assert.ok(!r.text.includes("Klaus Müller"), `name not redacted: ${r.text}`);
  });
});
