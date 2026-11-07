import type { IncomingNote } from "./notes.js";

/** `owner/name`, parsed from either that form or a github.com URL. */
export interface RepoRef {
  owner: string;
  repo: string;
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

export function parseRepo(input: string): RepoRef | null {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const fromUrl = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i);
  const parts = fromUrl ? [fromUrl[1], fromUrl[2]] : trimmed.split("/");
  if (!fromUrl && parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;
  return { owner, repo };
}

export type GithubErrorKind = "not_found" | "rate_limited" | "unauthorized" | "upstream";

export class GithubError extends Error {
  constructor(
    message: string,
    readonly kind: GithubErrorKind,
    readonly resetAt?: string,
  ) {
    super(message);
  }
}

export interface FetchIssuesOptions extends RepoRef {
  state: "open" | "closed" | "all";
  /** Only issues updated at or after this ISO time (incremental sync). */
  since?: string | null;
  token?: string | null;
  /** Skip issues opened by bots (CI reports, health checks); they are not feedback. */
  excludeBots: boolean;
  /** Stop after this many kept issues. */
  max: number;
  onPage?: (info: { page: number; kept: number }) => Promise<void> | void;
}

export interface FetchIssuesResult {
  notes: IncomingNote[];
  botsSkipped: number;
  /** More matching issues exist than were fetched (max reached, or the search API's 1,000-result cap). */
  truncated: boolean;
  /** Which GitHub API was used. GraphQL needs a token; search works anonymously. */
  api: "graphql" | "search";
}

/**
 * Fetch a repo's issues, newest first, without pull requests.
 *
 * With a token this uses GraphQL, whose `issues` connection never includes
 * PRs (about one request per 100 issues). Without a token it falls back to
 * the REST search API, which also filters PRs but caps results at 1,000.
 * The plain REST issues endpoint is avoided because PRs count against its
 * pages: on PR-heavy repos it can take ten times the requests.
 */
export function fetchRepoIssues(opts: FetchIssuesOptions): Promise<FetchIssuesResult> {
  return opts.token ? fetchViaGraphql(opts, opts.token) : fetchViaSearch(opts);
}

// ---------------------------------------------------------------- GraphQL

const ISSUES_QUERY = `
query($owner: String!, $repo: String!, $after: String, $states: [IssueState!], $since: DateTime) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, after: $after, states: $states, orderBy: { field: CREATED_AT, direction: DESC }, filterBy: { since: $since }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number url title body state createdAt
        author { __typename login avatarUrl }
        comments { totalCount }
        reactions { totalCount }
        labels(first: 20) { nodes { name } }
      }
    }
  }
}`;

interface GqlIssue {
  number: number;
  url: string;
  title: string;
  body: string | null;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  author: { __typename: string; login: string; avatarUrl: string } | null;
  comments: { totalCount: number };
  reactions: { totalCount: number };
  labels: { nodes: Array<{ name: string }> };
}

async function fetchViaGraphql(opts: FetchIssuesOptions, token: string): Promise<FetchIssuesResult> {
  const notes: IncomingNote[] = [];
  let botsSkipped = 0;
  let after: string | null = null;
  let page = 0;
  let hasNext = true;
  const states = opts.state === "all" ? null : [opts.state.toUpperCase()];

  while (hasNext && notes.length < opts.max) {
    page++;
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...baseHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ISSUES_QUERY,
        variables: { owner: opts.owner, repo: opts.repo, after, states, since: opts.since ?? null },
      }),
    });
    if (!res.ok) throw httpError(res, opts);
    const json = (await res.json()) as {
      data?: { repository: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlIssue[] } } | null };
      errors?: Array<{ type?: string; message?: string }>;
    };
    if (json.errors?.length) throw graphqlError(json.errors, opts);
    const issues = json.data?.repository?.issues;
    if (!issues) throw new GithubError(`GitHub repo ${opts.owner}/${opts.repo} was not found.`, "not_found");

    for (const issue of issues.nodes) {
      if (opts.excludeBots && issue.author?.__typename === "Bot") {
        botsSkipped++;
        continue;
      }
      notes.push({
        externalId: String(issue.number),
        url: issue.url,
        title: issue.title,
        body: issue.body ?? "",
        author: issue.author?.login ?? null,
        authorAvatar: issue.author?.avatarUrl ?? null,
        reactions: issue.reactions.totalCount,
        comments: issue.comments.totalCount,
        labels: issue.labels.nodes.map((l) => l.name),
        state: issue.state.toLowerCase(),
        sourceCreatedAt: issue.createdAt,
      });
      if (notes.length >= opts.max) break;
    }
    hasNext = issues.pageInfo.hasNextPage;
    after = issues.pageInfo.endCursor;
    await opts.onPage?.({ page, kept: notes.length });
  }
  return { notes, botsSkipped, truncated: hasNext, api: "graphql" };
}

function graphqlError(errors: Array<{ type?: string; message?: string }>, opts: FetchIssuesOptions): GithubError {
  const repo = `${opts.owner}/${opts.repo}`;
  if (errors.some((e) => e.type === "NOT_FOUND")) {
    return new GithubError(`GitHub repo ${repo} was not found, or the saved token cannot see it.`, "not_found");
  }
  if (errors.some((e) => e.type === "RATE_LIMITED")) {
    return new GithubError("GitHub's rate limit for the saved token is used up. Try again in an hour.", "rate_limited");
  }
  return new GithubError(`GitHub could not list issues for ${repo}.`, "upstream");
}

// ----------------------------------------------------------------- Search

const SEARCH_CAP = 1000;

interface SearchIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  comments: number;
  created_at: string;
  user: { login: string; avatar_url: string; type: string } | null;
  labels: Array<{ name?: string }>;
  reactions?: { total_count?: number };
}

async function fetchViaSearch(opts: FetchIssuesOptions): Promise<FetchIssuesResult> {
  const terms = [`repo:${opts.owner}/${opts.repo}`, "is:issue"];
  if (opts.state !== "all") terms.push(`is:${opts.state}`);
  if (opts.since) terms.push(`updated:>=${opts.since.slice(0, 19)}`);
  const notes: IncomingNote[] = [];
  let botsSkipped = 0;
  let total = 0;
  let seen = 0;

  for (let page = 1; page <= SEARCH_CAP / 100 && notes.length < opts.max; page++) {
    const params = new URLSearchParams({ q: terms.join(" "), sort: "created", order: "desc", per_page: "100", page: String(page) });
    const res = await fetch(`https://api.github.com/search/issues?${params}`, { headers: baseHeaders(null) });
    if (res.status === 422 && page === 1) {
      throw new GithubError(`GitHub repo ${opts.owner}/${opts.repo} was not found, or it is private.`, "not_found");
    }
    if (!res.ok) throw httpError(res, opts);
    const json = (await res.json()) as { total_count: number; items: SearchIssue[] };
    total = json.total_count;
    for (const issue of json.items) {
      seen++;
      if (opts.excludeBots && issue.user?.type === "Bot") {
        botsSkipped++;
        continue;
      }
      notes.push({
        externalId: String(issue.number),
        url: issue.html_url,
        title: issue.title,
        body: issue.body ?? "",
        author: issue.user?.login ?? null,
        authorAvatar: issue.user?.avatar_url ?? null,
        reactions: issue.reactions?.total_count ?? 0,
        comments: issue.comments ?? 0,
        labels: issue.labels.map((l) => l.name).filter((n): n is string => !!n),
        state: issue.state,
        sourceCreatedAt: issue.created_at,
      });
      if (notes.length >= opts.max) break;
    }
    await opts.onPage?.({ page, kept: notes.length });
    if (json.items.length < 100) break;
  }
  return { notes, botsSkipped, truncated: seen < total, api: "search" };
}

// ----------------------------------------------------------------- Shared

function baseHeaders(token: string | null): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Groundswell",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function httpError(res: Response, opts: FetchIssuesOptions): GithubError {
  const repo = `${opts.owner}/${opts.repo}`;
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined;
  if (res.status === 404) {
    return new GithubError(`GitHub repo ${repo} was not found, or it is private and no token with access is saved.`, "not_found");
  }
  if (res.status === 401) {
    return new GithubError("The saved GitHub token was rejected. Update it in Settings.", "unauthorized");
  }
  if (res.status === 429 || (res.status === 403 && remaining === "0")) {
    const hint = opts.token ? "" : " Add a GitHub token in Settings to raise the limit.";
    return new GithubError(`GitHub's rate limit is used up${resetAt ? ` until ${resetAt}` : ""}.${hint}`, "rate_limited", resetAt);
  }
  // Never echo the response body: it can contain request details.
  return new GithubError(`GitHub returned ${res.status} for ${repo}.`, "upstream");
}
