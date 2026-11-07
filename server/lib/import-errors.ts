import { defineActionErrors } from "@agent-native/core/action";

import { GithubError } from "./github.js";
import { SecretLookupError } from "./secrets.js";

/** Failure codes shared by the GitHub import actions. */
export const githubImportErrors = defineActionErrors(
  "invalid_repo",
  "source_not_found",
  "repo_not_found",
  "rate_limited",
  "github_unauthorized",
  "github_unavailable",
  "secret_lookup_failed",
);

/** Turn a thrown import error into the action's typed failure. */
export function rethrowImportError(err: unknown): never {
  if (err instanceof GithubError) {
    switch (err.kind) {
      case "not_found":
        return githubImportErrors.fail(err.message, "repo_not_found", { statusCode: 404 });
      case "rate_limited":
        return githubImportErrors.fail(err.message, "rate_limited", {
          statusCode: 429,
          ...(err.resetAt ? { details: { resetAt: err.resetAt } } : {}),
        });
      case "unauthorized":
        return githubImportErrors.fail(err.message, "github_unauthorized", { statusCode: 401 });
      default:
        return githubImportErrors.fail(err.message, "github_unavailable", { statusCode: 502 });
    }
  }
  if (err instanceof SecretLookupError) {
    return githubImportErrors.fail(err.message, "secret_lookup_failed", { statusCode: 503 });
  }
  throw err;
}
