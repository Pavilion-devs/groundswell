/**
 * A read-only snapshot of the real demo board for the landing page, where
 * visitors are not signed in and cannot call actions. Taken 2026-11-09 from the
 * board built on the public BuilderIO/agent-native issues: problem names, ranks
 * and scores come from get-priorities (SQL), the reports and their verified
 * quotes from list-notes. Nothing here is invented.
 */
import type { Column } from "@/components/groundswell/BoardColumn";
import type { Report } from "@/components/groundswell/ReportCard";

export const SNAPSHOT = {
  takenAt: "2026-11-09",
  source: "BuilderIO/agent-native",
  reports: 340,
  problems: 14,
  unsorted: 29,
};

type Raw = Pick<Report, "id" | "title" | "quote" | "author" | "comments" | "createdAt" | "url">;

function report(r: Raw): Report {
  return { ...r, excerpt: "", labels: [], reactions: 0, pinned: false, confidence: null, themeId: null, suggestion: null };
}

export const SNAPSHOT_COLUMNS: Column[] = [
  {
    id: "thm_07b8f41105644c7e9ddc",
    title: "Wants hooks to customize the framework",
    kind: "problem",
    rank: 1,
    score: 91.1,
    total: 37,
    reports: [
      report({ id: "note_a75ba0d0ded048aaad84", title: "Let an action end the turn when the model's final response is empty (no 'finish the original request' retry)", quote: "We patch in a run-context flag an action can set", author: "multiplehats", comments: 4, createdAt: "2026-09-23T18:36:40Z", url: "https://github.com/BuilderIO/agent-native/issues/5736" }),
      report({ id: "note_dab570be2b2248769254", title: "MCP client OAuth registration hardcodes client_name \"Agent-Native MCP connector\"; apps cannot brand the consent screen", quote: "apps cannot brand the consent screen", author: "multiplehats", comments: 1, createdAt: "2026-09-17T14:21:59Z", url: "https://github.com/BuilderIO/agent-native/issues/5265" }),
      report({ id: "note_56545fb8b06b485cbfd2", title: "Idempotent Inbox notifications: notifyInboxOnce(input, { owner, idempotencyKey })", quote: "We patch in `notifyInboxOnce(input, { owner, idempotencyKey })`:", author: "multiplehats", comments: 3, createdAt: "2026-09-23T18:36:43Z", url: "https://github.com/BuilderIO/agent-native/issues/5739" }),
    ],
  },
  {
    id: "thm_29b1bd61d06545c1a603",
    title: "Agent runs lose tool calls or stall",
    kind: "problem",
    rank: 2,
    score: 86.2,
    total: 27,
    reports: [
      report({ id: "note_465ddcc01c3e4897b3a1", title: "Agent can wedge a run indefinitely via raw db-query / meta-tool spiral: no wall-clock timeout, no progress heartbeat", quote: "an agent that keeps issuing DB reads can stall a run indefinitely.", author: "ai4U23", comments: 1, createdAt: "2026-10-17T13:58:59Z", url: "https://github.com/BuilderIO/agent-native/issues/7782" }),
      report({ id: "note_e3cc284a0e3f4a4b9f2d", title: "Approving a tool call re-prompts the model instead of replaying the approved call, so long writes loop and don't save", quote: "Approving a tool call re-prompts the model instead of replaying the approved call", author: "nabilkhan199999", comments: 1, createdAt: "2026-10-13T15:22:31Z", url: "https://github.com/BuilderIO/agent-native/issues/7480" }),
      report({ id: "note_40200f8c443541beb37b", title: "Tool runs persist no events: server fold writes the raw event cursor into runs[].lastSequence", quote: "Tool runs persist no events: server fold writes the raw event cursor into runs[].lastSequence", author: "amirmamaghani", comments: 2, createdAt: "2026-10-11T11:06:11Z", url: "https://github.com/BuilderIO/agent-native/issues/7377" }),
    ],
  },
  {
    id: "thm_933eab928dd045acadd8",
    title: "Docs 404s and broken setup",
    kind: "problem",
    rank: 3,
    score: 75.7,
    total: 31,
    reports: [
      report({ id: "note_9e525e3e3ceb4bf5b21f", title: "Docs error: Page not found", quote: "The page you're looking for doesn't exist or has been moved.", author: "1Bharat007", comments: 3, createdAt: "2026-08-12T10:51:26Z", url: "https://github.com/BuilderIO/agent-native/issues/2813" }),
      report({ id: "note_72a05d1daf854076b4f2", title: "Local multi-app workspace on Windows: apps fail to open (startup kill leaves Vite running, registry URL 404)", quote: "apps other than Dispatch keep failing to open.", author: "gustavoalves-ia", comments: 3, createdAt: "2026-09-24T23:35:49Z", url: "https://github.com/BuilderIO/agent-native/issues/5866" }),
    ],
  },
  {
    id: "thm_1283a655c888480ea174",
    title: "Deploys crash on hosting platforms",
    kind: "problem",
    rank: 4,
    score: 68.5,
    total: 23,
    reports: [
      report({ id: "note_faa1309696424529b1d5", title: "Serverless Postgres: pool of 2 per instance plus about 60 requests per Documents page load exhausts a small Neon compute", quote: "Neon refused new connections", author: "efernandezr", comments: 7, createdAt: "2026-09-06T18:08:40Z", url: "https://github.com/BuilderIO/agent-native/issues/4440" }),
      report({ id: "note_e6dc29c773d84cf3a846", title: "Standalone app crashes on every route on Vercel/Netlify: circular import between @agent-native/core and @agent-native/creative-context", quote: "Standalone app crashes on every route on Vercel/Netlify", author: "Nate-Lassiter", comments: 4, createdAt: "2026-08-08T00:48:55Z", url: "https://github.com/BuilderIO/agent-native/issues/2752" }),
    ],
  },
  {
    id: "thm_46e9b0e4c33b44eaa37a",
    title: "Bugs in Plan, Content, Calendar, Mail and Design apps",
    kind: "problem",
    rank: 5,
    score: 59.8,
    total: 29,
    reports: [
      report({ id: "note_2d5b9762c21a4966b04d", title: "Persian / RTL plans render broken", quote: "the rendering falls apart in RTL.", author: "SaeedCodez", comments: 4, createdAt: "2026-06-18T13:47:36Z", url: "https://github.com/BuilderIO/agent-native/issues/1295" }),
      report({ id: "note_b227c1a0cc0d47999f3d", title: "Collab Yjs seed race duplicates block content on every load (self-hosted, real-time collab + SQLite persistence)", quote: "Every time a plan is opened / hard-reloaded, block bodies render **duplicated**", author: "TheOdemOfTorque", comments: 3, createdAt: "2026-07-05T23:39:45Z", url: "https://github.com/BuilderIO/agent-native/issues/1897" }),
    ],
  },
];
