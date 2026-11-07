import Papa from "papaparse";

import { hashText } from "./ids.js";
import type { IncomingNote } from "./notes.js";

export interface CsvColumns {
  body: string;
  title?: string | undefined;
  author?: string | undefined;
  url?: string | undefined;
  date?: string | undefined;
  id?: string | undefined;
  reactions?: string | undefined;
}

/** Header names we recognise, most specific first. Matched case-insensitively. */
const GUESSES: Record<keyof CsvColumns, string[]> = {
  body: ["body", "feedback", "review", "comment", "comments", "content", "text", "message", "description", "response", "details", "note"],
  title: ["title", "subject", "summary", "headline"],
  author: ["author", "user", "username", "customer", "name", "reviewer", "from"],
  url: ["url", "link", "permalink", "href"],
  date: ["date", "created_at", "created", "timestamp", "submitted_at", "time"],
  id: ["id", "ticket_id", "ticket", "review_id", "external_id", "number"],
  reactions: ["votes", "upvotes", "reactions", "likes", "score", "+1"],
};

export function guessColumns(headers: string[]): Partial<CsvColumns> {
  // "Ticket ID", "ticket-id" and "ticket_id" all normalise to "ticket_id".
  const lower = new Map(headers.map((h) => [h.trim().toLowerCase().replace(/[\s-]+/g, "_"), h]));
  const out: Partial<CsvColumns> = {};
  for (const key of Object.keys(GUESSES) as Array<keyof CsvColumns>) {
    for (const guess of GUESSES[key]) {
      const hit = lower.get(guess);
      if (hit && !Object.values(out).includes(hit)) {
        out[key] = hit;
        break;
      }
    }
  }
  return out;
}

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
  errors: number;
}

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  return { headers: result.meta.fields ?? [], rows: result.data, errors: result.errors.length };
}

/** Map CSV rows to notes; rows with an empty body are skipped and counted. */
export function rowsToNotes(rows: Array<Record<string, string>>, cols: CsvColumns): { notes: IncomingNote[]; skipped: number } {
  const notes: IncomingNote[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const body = (row[cols.body] ?? "").trim();
    if (!body) {
      skipped++;
      continue;
    }
    const title = cols.title ? (row[cols.title] ?? "").trim() || null : null;
    const author = cols.author ? (row[cols.author] ?? "").trim() || null : null;
    const rawId = cols.id ? (row[cols.id] ?? "").trim() : "";
    let externalId = rawId || `h_${hashText(`${title ?? ""}\n${body}\n${author ?? ""}`)}`;
    // Identical rows in one file collapse to one note; distinct ids never do.
    if (seen.has(externalId)) {
      skipped++;
      continue;
    }
    seen.add(externalId);
    const url = cols.url ? safeHttpUrl(row[cols.url]) : null;
    const date = cols.date ? toIsoDate(row[cols.date]) : null;
    const reactions = cols.reactions ? Number.parseInt(row[cols.reactions] ?? "", 10) : Number.NaN;
    notes.push({
      externalId,
      title,
      body,
      author,
      url,
      sourceCreatedAt: date,
      reactions: Number.isFinite(reactions) && reactions > 0 ? reactions : 0,
    });
  }
  return { notes, skipped };
}

/** Only http(s) links are kept, so a CSV cannot plant javascript: URLs. */
function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function toIsoDate(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
