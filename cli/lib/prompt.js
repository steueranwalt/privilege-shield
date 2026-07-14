import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";

/**
 * Ask for a pseudonym for each novel entity before redaction.
 * Enter = accept suggestion; "-" = skip (keep cleartext); custom text = use that.
 *
 * @param {Array<{key:string,type:string,value:string,suggestion:string}>} pending
 * @param {{ auto?: boolean }} opts
 * @returns {Promise<Record<string, string|null>>} key → pseudonym (null = skip)
 */
export async function promptPseudonyms(pending, opts = {}) {
  const assignments = {};
  if (!pending.length) return assignments;

  if (opts.auto || !input.isTTY || !output.isTTY) {
    for (const p of pending) assignments[p.key] = p.suggestion;
    return assignments;
  }

  const rl = createInterface({ input, output });
  const ask = (q) =>
    new Promise((resolve) => {
      rl.question(q, (ans) => resolve(ans));
    });

  console.error("\nPseudonyme festlegen (vor der Schreibung):");
  console.error("  Enter = Vorschlag übernehmen · „-“ = unverändert lassen · sonst eigenes Pseudonym\n");

  try {
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const label = `[${i + 1}/${pending.length}] ${p.type}: ${JSON.stringify(p.value)}`;
      const ans = (await ask(`${label}\n  → Pseudonym [${p.suggestion}]: `)).trim();
      if (ans === "-") assignments[p.key] = null;
      else if (!ans) assignments[p.key] = p.suggestion;
      else assignments[p.key] = ans;
    }
  } finally {
    rl.close();
  }

  console.error("");
  return assignments;
}
