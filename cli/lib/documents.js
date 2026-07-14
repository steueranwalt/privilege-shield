/**
 * Unified document I/O for .txt/.md/… and .docx text-layer.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname } from "node:path";
import {
  isDocxPath,
  extractDocxText,
  replaceInDocx,
  invertSessionMap,
} from "./docx.js";
import { anonymizeString, restoreText } from "./redact.js";

export { isDocxPath };

export async function loadDocument(path) {
  if (isDocxPath(path)) {
    const buffer = readFileSync(path);
    const text = await extractDocxText(buffer);
    return { kind: "docx", path, buffer, text };
  }
  const text = readFileSync(path, "utf8");
  return { kind: "text", path, text };
}

/**
 * Anonymize one loaded document with shared session state.
 * For docx: detect on extracted text, then rewrite <w:t> with real→token.
 */
export async function anonymizeDocument(doc, options = {}) {
  const r = anonymizeString(doc.text, options);
  if (doc.kind === "docx") {
    const realToToken = invertSessionMap(r.sessionMap);
    // Only apply pairs that appear in this file's detections / map updates
    const local = {};
    for (const it of r.items) {
      if (it.enabled && it.placeholder) local[it.value] = it.placeholder;
    }
    // Also apply full session map so earlier-session tokens rewrite if present
    Object.assign(local, realToToken);
    const buffer = await replaceInDocx(doc.buffer, local);
    return { ...r, kind: "docx", buffer };
  }
  return { ...r, kind: "text" };
}

export async function restoreDocument(doc, sessionMap) {
  if (doc.kind === "docx") {
    const buffer = await replaceInDocx(doc.buffer, sessionMap);
    const text = await extractDocxText(buffer);
    return { kind: "docx", buffer, text, leftover: [] };
  }
  const { text, leftover } = restoreText(doc.text, sessionMap);
  return { kind: "text", text, leftover };
}

export function writeDocument(path, result) {
  mkdirSync(dirname(path), { recursive: true });
  if (result.kind === "docx") {
    writeFileSync(path, result.buffer);
  } else {
    writeFileSync(path, result.text, "utf8");
  }
}

export function supportedExt(path) {
  const e = extname(path).toLowerCase();
  return (
    e === ".docx" ||
    [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".tsv",
      ".json",
      ".html",
      ".htm",
      ".xml",
      ".rtf",
      ".log",
    ].includes(e)
  );
}
