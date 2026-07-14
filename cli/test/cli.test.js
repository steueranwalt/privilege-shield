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

  it("anonymizes with pseudonyms, keeps dates, restores via key", () => {
    const out = join(dir, "redacted");
    const key = join(dir, "secrets", "key.json");
    const back = join(dir, "restored");

    const a = run(
      ["anonymize", fixtures, "--out", out, "--key", key, "--auto", "--json"],
      dir
    );
    assert.equal(a.status, 0, a.stderr + a.stdout);
    const summary = JSON.parse(a.stdout);
    assert.ok(summary.files >= 3);
    assert.ok(summary.uniquePseudonyms > 0);
    assert.equal(summary.datesLeftIntact, true);
    assert.ok(existsSync(key));

    const chOut = readFileSync(join(out, "ch-sample.redacted.txt"), "utf8");
    assert.ok(!chOut.includes("klaus.mueller@beispiel.ch"));
    assert.ok(chOut.includes("1.3.2024"));
    assert.ok(chOut.includes("14.07.2023"));
    assert.ok(chOut.includes("Beschwerdeführer"));
    assert.ok(!/\[EMAIL_\d+\]/.test(chOut));

    const d = run(
      ["deanonymize", out, "--out", back, "--key", key, "--json"],
      dir
    );
    assert.equal(d.status, 0, d.stderr);
    const restoredCh = readFileSync(join(back, "ch-sample.txt"), "utf8");
    const originalCh = readFileSync(join(fixtures, "ch-sample.txt"), "utf8");
    assert.equal(restoredCh, originalCh);
  });

  it("scan --json reports Swiss detections without dates", () => {
    const r = run(["scan", join(fixtures, "ch-sample.txt"), "--json", "--auto"], dir);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.files, 1);
    assert.equal(summary.datesLeftIntact, true);
    assert.ok(summary.uniquePseudonyms > 3);
  });
});
