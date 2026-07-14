import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildMinimalDocx, extractDocxText } from "../lib/docx.js";
import { loadDocument, anonymizeDocument, restoreDocument } from "../lib/documents.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = join(__dirname, "..", "bin", "privilege-shield.js");

describe("docx text-layer", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ps-docx-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("anonymizes and restores a .docx with shared tokens", async () => {
    const buf = await buildMinimalDocx([
      "Der Beschwerdeführer Klaus Müller wohnt in Zürich.",
      "Kontakt: klaus.mueller@beispiel.ch — Datum 1.3.2024 bleibt.",
    ]);
    const inPath = join(dir, "matter.docx");
    writeFileSync(inPath, buf);

    const doc = await loadDocument(inPath);
    assert.ok(doc.text.includes("Klaus Müller"));

    const sessionMap = {};
    const counters = {};
    const existingByKey = {};
    const r = await anonymizeDocument(doc, {
      sessionMap,
      counters,
      existingByKey,
      style: "placeholders",
    });
    assert.equal(r.kind, "docx");
    const redactedText = await extractDocxText(r.buffer);
    assert.ok(!redactedText.includes("Klaus Müller"));
    assert.ok(!redactedText.includes("klaus.mueller@beispiel.ch"));
    assert.ok(redactedText.includes("1.3.2024"));
    assert.ok(/\[[A-Z]+_\d+\]/.test(redactedText));

    const restored = await restoreDocument(
      { kind: "docx", buffer: r.buffer, text: redactedText },
      r.sessionMap
    );
    const back = await extractDocxText(restored.buffer);
    assert.ok(back.includes("Klaus Müller"));
    assert.ok(back.includes("klaus.mueller@beispiel.ch"));
  });

  it("CLI batch anonymize includes docx", async () => {
    const buf = await buildMinimalDocx([
      "Schreiben an Anna Schäfer, anna.schaefer@beispiel.de, Az. 12 C 345/24.",
    ]);
    const inbox = join(dir, "inbox");
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, "a.docx"), buf);
    writeFileSync(
      join(inbox, "b.txt"),
      "Folgefrage an Anna Schäfer bitte am 14.07.2023.\n"
    );

    const out = join(dir, "redacted");
    const key = join(dir, "secrets", "ps-key.json");
    const res = spawnSync(
      process.execPath,
      [
        bin,
        "anonymize",
        inbox,
        "--out",
        out,
        "--key",
        key,
        "--auto",
        "--placeholders",
        "--json",
      ],
      { encoding: "utf8" }
    );
    assert.equal(res.status, 0, res.stderr + res.stdout);
    const summary = JSON.parse(res.stdout);
    assert.ok(summary.files >= 2);

    const redactedDocx = readFileSync(join(out, "a.redacted.docx"));
    const text = await extractDocxText(redactedDocx);
    assert.ok(!text.includes("Anna Schäfer"));
    assert.ok(text.includes("[CLIENT_") || text.includes("[ENTITY_") || text.includes("[TERM_"));

    // same token for Anna across txt + docx
    const txt = readFileSync(join(out, "b.redacted.txt"), "utf8");
    const all = text + "\n" + txt;
    const clientTokens = [
      ...new Set([...all.matchAll(/\[(?:CLIENT|ENTITY)_\d+\]/g)].map((m) => m[0])),
    ];
    assert.ok(clientTokens.length >= 1);
    assert.ok(
      clientTokens.some((t) => text.includes(t) && txt.includes(t)),
      `shared token expected; docx=${text} txt=${txt}`
    );

    // agent-safe meta without cleartext values
    const meta = JSON.parse(readFileSync(join(out, "ps-session-meta.json"), "utf8"));
    assert.ok(meta.tokenCount > 0);
    assert.ok(!JSON.stringify(meta).includes("Schäfer"));
  });
});
