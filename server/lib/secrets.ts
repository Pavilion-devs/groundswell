import { registerRequiredSecret } from "@agent-native/core/secrets";
import { resolveSecretDetailed } from "@agent-native/core/server";

export const GITHUB_TOKEN_KEY = "GITHUB_TOKEN";

registerRequiredSecret({
  key: GITHUB_TOKEN_KEY,
  label: "GitHub token",
  description:
    "Optional for public repos (raises GitHub's rate limit from 60 to 5,000 requests an hour). Needed to file issues from an Insight Brief.",
  docsUrl: "https://github.com/settings/personal-access-tokens",
  scope: "user",
  kind: "api-key",
  required: false,
  usedFor: [
    { appId: "groundswell", feature: "GitHub import", effectWhenRemoved: "Imports use GitHub's anonymous rate limit." },
    { appId: "groundswell", feature: "File issue", effectWhenRemoved: "Filing issues to GitHub is unavailable." },
  ],
});

export class SecretLookupError extends Error {}

/** The caller's GitHub token, or null when they have not added one. */
export async function getGithubToken(): Promise<string | null> {
  const detail = await resolveSecretDetailed(GITHUB_TOKEN_KEY);
  if (detail.lookupFailed) {
    throw new SecretLookupError("Could not read the saved GitHub token. Try again in a moment.");
  }
  return detail.value || null;
}
