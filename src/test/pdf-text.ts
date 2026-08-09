import { inflateSync } from "node:zlib";

/**
 * Read text back out of a generated PDF, for tests.
 *
 * Deliberately no new dependency, and deliberately operating on real production
 * bytes — compressed, exactly as a customer receives them — rather than adding
 * a test-only "don't compress" switch to the renderer's public API.
 *
 * PDFKit embeds subsetted TrueType fonts as CIDFontType2 with Identity-H
 * encoding, so the operands in a text-showing operator are GLYPH IDS, not
 * characters. Turning them back into text needs each font's own ToUnicode CMap.
 *
 * THE PART THAT MAKES THIS FIDDLY: a receipt uses two faces (regular and bold),
 * PDFKit subsets each independently, and both subsets number their glyphs from
 * zero. So the CMaps cannot be merged — glyph 5 means one character in the
 * regular font and a different one in the bold. The decoder therefore tracks
 * which font is selected (`/F1 9.5 Tf`) and decodes against that font's CMap,
 * which means resolving the page's font resources to their ToUnicode streams
 * first.
 */

/** Every `N 0 obj … endobj` body, keyed by object number. */
function indexObjects(raw: string): Map<number, string> {
  const objects = new Map<number, string>();
  const pattern = /(\d+)\s+\d+\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endobj", start);
    objects.set(Number(match[1]), raw.slice(start, end === -1 ? undefined : end));
  }

  return objects;
}

/** The inflated payload of an object that is a stream, or null. */
function streamOf(body: string | undefined): string | null {
  if (!body) return null;
  const marker = body.match(/stream\r?\n/);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index + marker[0].length;
  const end = body.indexOf("endstream", start);
  if (end === -1) return null;
  try {
    return inflateSync(Buffer.from(body.slice(start, end), "latin1")).toString("latin1");
  } catch {
    return body.slice(start, end);
  }
}

/** Everything between each `begin<name>` and `end<name>`. */
function sections(text: string, name: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`begin${name}([\\s\\S]*?)end${name}`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) found.push(match[1]!);
  return found;
}

function utf16BeToString(hex: string): string {
  let out = "";
  for (let index = 0; index + 4 <= hex.length; index += 4) {
    const unit = parseInt(hex.slice(index, index + 4), 16);
    if (!Number.isNaN(unit)) out += String.fromCharCode(unit);
  }
  return out;
}

/**
 * glyph id -> character, for ONE font.
 *
 * Order matters and getting it wrong is silent. `bfrange` has two forms —
 * `<start> <end> [<a> <b> …]` and `<start> <end> <dstStart>` — and the
 * three-token pattern happily matches any three consecutive entries INSIDE an
 * array. Left unguarded it reads `<0000> <0042> <0061>` out of the middle of an
 * array as "map glyphs 0..66 to a contiguous run from U+0061", overwriting every
 * correct mapping with plausible-looking garbage. So the array form is consumed
 * and blanked out before the run form is looked for at all.
 */
function parseCmap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const section of sections(cmap, "bfrange")) {
    const arrayForm = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
    let match: RegExpExecArray | null;
    while ((match = arrayForm.exec(section)) !== null) {
      const start = parseInt(match[1]!, 16);
      const entries = match[3]!.match(/<([0-9a-fA-F]*)>/g) || [];
      entries.forEach((entry, offset) => {
        const hex = entry.replace(/[<>]/g, "");
        if (hex) map.set(start + offset, utf16BeToString(hex));
      });
    }

    const remainder = section.replace(arrayForm, " ");
    const runForm = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    while ((match = runForm.exec(remainder)) !== null) {
      const start = parseInt(match[1]!, 16);
      const end = parseInt(match[2]!, 16);
      const destination = parseInt(match[3]!, 16);
      if (end < start || end - start > 0xffff) continue;
      for (let glyph = start; glyph <= end; glyph += 1) {
        map.set(glyph, String.fromCodePoint(destination + (glyph - start)));
      }
    }
  }

  for (const section of sections(cmap, "bfchar")) {
    const pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let match: RegExpExecArray | null;
    while ((match = pair.exec(section)) !== null) {
      map.set(parseInt(match[1]!, 16), utf16BeToString(match[2]!));
    }
  }

  return map;
}

/** Resource name (`F1`) -> that font's glyph map. */
function buildFontTable(raw: string, objects: Map<number, string>): Map<string, Map<number, string>> {
  const byName = new Map<string, Map<number, string>>();
  const byObject = new Map<number, Map<number, string>>();

  for (const [number, body] of objects) {
    const toUnicode = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (!toUnicode) continue;
    const cmap = streamOf(objects.get(Number(toUnicode[1])));
    if (cmap) byObject.set(number, parseCmap(cmap));
  }

  // /Font << /F1 7 0 R /F2 12 0 R >>
  const fontDicts = /\/Font\s*<<([\s\S]*?)>>/g;
  let dict: RegExpExecArray | null;
  while ((dict = fontDicts.exec(raw)) !== null) {
    const entry = /\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g;
    let reference: RegExpExecArray | null;
    while ((reference = entry.exec(dict[1]!)) !== null) {
      const map = byObject.get(Number(reference[2]));
      if (map) byName.set(reference[1]!, map);
    }
  }

  return byName;
}

function contentStreams(raw: string, objects: Map<number, string>): string[] {
  const found: string[] = [];
  for (const body of objects.values()) {
    const text = streamOf(body);
    if (text && text.includes("BT") && /T[jJ]/.test(text)) found.push(text);
  }
  return found;
}

/** All the text drawn in the document, pages concatenated in object order. */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const objects = indexObjects(raw);
  const fonts = buildFontTable(raw, objects);
  let out = "";

  for (const content of contentStreams(raw, objects)) {
    let active: Map<number, string> | undefined;

    // One pass, in document order, so a `Tf` always applies to the text after
    // it. Matching them separately would decode every run with whichever font
    // happened to be selected last.
    const token = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9a-fA-F]+)>\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let match: RegExpExecArray | null;

    while ((match = token.exec(content)) !== null) {
      if (match[1] !== undefined) {
        active = fonts.get(match[1]) ?? active;
        continue;
      }

      const hexes = match[2] !== undefined
        ? [match[2]]
        : (match[3]!.match(/<([0-9a-fA-F]*)>/g) || []).map((part) => part.replace(/[<>]/g, ""));

      for (const hex of hexes) {
        for (let index = 0; index + 4 <= hex.length; index += 4) {
          const glyph = parseInt(hex.slice(index, index + 4), 16);
          out += active?.get(glyph) ?? "";
        }
      }
      out += " ";
    }
  }

  return out;
}

/** How many pages the document has. */
export function pdfPageCount(pdf: Buffer): number {
  const raw = pdf.toString("latin1");
  const declared = raw.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
  if (declared) return Number(declared[1]);
  return (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
}
