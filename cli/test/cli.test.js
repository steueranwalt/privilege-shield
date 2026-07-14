import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = join(__dirname, "..", "bin", "privilege-shield.js");
const fixtures = join(__dirname, "fixtures");

function run(args, cwd) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("CLI batch anonymize / deanonymize", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ps-cli-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("anonymizes a folder and restores with the key", () => {
    const out = join(dir, "redacted");
    const key = join(dir, "secrets", "key.json");
    const back = join(dir, "restored");

    const a = run(
      ["anonymize", fixtures, "--out", out, "--key", key, "--json"],
      dir
    );
    assert.equal(a.status, 0, a.stderr);
    const summary = JSON.parse(a.stdout);
    assert.ok(summary.files >= 2);
    assert.ok(summary.uniquePlaceholders > 0);
    assert.ok(existsSync(key));

    const deOut = readFileSync(join(out, "de-sample.redacted.txt"), "utf8");
    assert.ok(!deOut.includes("anna.schaefer@beispiel.de"));
    assert.ok(deOut.includes("[EMAIL_"));

    const d = run(
      ["deanonymize", out, "--out", back, "--key", key, "--json"],
      dir
    );
    assert.equal(d.status, 0, d.stderr);
    const restoredDe = readFileSync(join(back, "de-sample.txt"), "utf8");
    const originalDe = readFileSync(join(fixtures, "de-sample.txt"), "utf8");
    assert.equal(restoredDe, originalDe);
  });

  it("scan --json reports German detections", () => {
    const r = run(["scan", join(fixtures, "de-sample.txt"), "--json"], dir);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.files, 1);
    assert.ok(summary.uniquePlaceholders > 5);
    const types = new Set(
      summary.results[0].sample.map((s) => s.type)
    );
    assert.ok(types.has("iban") || types.has("email"));
  });
});
