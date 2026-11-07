/**
 * Evidence quotes. A quote is only ever stored as a span into a note's text,
 * and only if the quoted words really appear there. This is the server-side
 * guarantee behind "never fabricate evidence".
 */

/** The text quote spans index into: title, blank line, body (or just the body). */
export function noteText(note: { title: string | null; body: string }): string {
  return note.title ? `${note.title}\n\n${note.body}` : note.body;
}

export const MAX_QUOTE_CHARS = 400;

/** The stored quote text for a span, or null. */
export function quoteOf(text: string, start: number | null, end: number | null): string | null {
  if (start === null || end === null || start < 0 || end > text.length || end <= start) return null;
  return text.slice(start, end);
}

/**
 * Find `quote` in `text` and return its [start, end) span, or null when the
 * words are not there. Matching ignores differences in whitespace and in
 * curly vs straight quotes, which models often normalise, but nothing else:
 * every word must appear, in order, exactly as written.
 */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (q.length < 3 || q.length > MAX_QUOTE_CHARS) return null;

  const exact = text.indexOf(q);
  if (exact !== -1) return { start: exact, end: exact + q.length };

  // Normalised match, keeping a map back to original offsets.
  const { norm, map } = normalise(text);
  const target = normalise(q).norm;
  if (!target) return null;
  const at = norm.indexOf(target);
  if (at === -1) return null;
  const start = map[at];
  const endIndex = map[at + target.length - 1];
  if (start === undefined || endIndex === undefined) return null;
  return { start, end: endIndex + 1 };
}

function normalise(input: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    let ch = input[i] ?? "";
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (ch === "“" || ch === "”") ch = '"';
      else if (ch === "‘" || ch === "’") ch = "'";
    }
    norm += ch;
    map.push(i);
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}
