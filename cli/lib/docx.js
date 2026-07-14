/**
 * DOCX text-layer helpers (word/document.xml + headers/footers).
 * Replaces inside <w:t> runs. Values split across runs may be missed —
 * prefer continuous text for critical identifiers, or use .txt/.md extracts.
 */
import JSZip from "jszip";

const PART_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i;
const WT_RE = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isDocxPath(p) {
  return /\.docx$/i.test(p);
}

/** Extract plain text from a .docx Buffer for detection. */
export async function extractDocxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const chunks = [];
  const names = Object.keys(zip.files).filter((n) => PART_RE.test(n)).sort();
  for (const name of names) {
    const xml = await zip.file(name).async("string");
    let m;
    const re = new RegExp(WT_RE.source, "g");
    while ((m = re.exec(xml))) {
      chunks.push(decodeXml(m[2]));
    }
    chunks.push("\n");
  }
  return chunks.join("");
}

/**
 * Apply string replacements (token → replacement) longest-first inside every <w:t>.
 * @param {Buffer} buf
 * @param {Record<string,string>} map  find → replace
 */
export async function replaceInDocx(buf, map) {
  const pairs = Object.entries(map)
    .filter(([a, b]) => a && b != null && a !== b)
    .sort((a, b) => b[0].length - a[0].length);
  if (!pairs.length) return buf;

  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => PART_RE.test(n));
  for (const name of names) {
    let xml = await zip.file(name).async("string");
    xml = xml.replace(WT_RE, (full, attrs, body) => {
      let text = decodeXml(body);
      for (const [from, to] of pairs) {
        if (text.includes(from)) text = text.split(from).join(to);
      }
      return `<w:t${attrs}>${encodeXml(text)}</w:t>`;
    });
    zip.file(name, xml);
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

/**
 * Invert session map (token → real) into real → token for anonymize write-back.
 * Prefer longer keys first when applying.
 */
export function invertSessionMap(sessionMap) {
  const inv = {};
  for (const [token, real] of Object.entries(sessionMap)) {
    if (real != null && real !== "") inv[real] = token;
  }
  return inv;
}

/** Build a minimal .docx (for tests) with the given paragraph texts. */
export async function buildMinimalDocx(paragraphs) {
  const escape = encodeXml;
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escape(p)}</w:t></w:r></w:p>`
    )
    .join("");
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}<w:sectPr/></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels").file(".rels", rels);
  zip.folder("word").file("document.xml", documentXml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
