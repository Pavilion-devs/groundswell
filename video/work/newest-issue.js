// Print a GitHub `issues` webhook payload (action "opened") for the newest open, non-PR, non-bot issue in
// BuilderIO/agent-native whose number is not in the given list. node newest-issue.js <known-numbers.json>
const { execFileSync } = require("child_process");
const known = new Set(require("fs").existsSync(process.argv[2]) ? JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")).map(String) : []);
const repo = JSON.parse(execFileSync("gh", ["api", "repos/BuilderIO/agent-native"], { encoding: "utf8" }));
const issues = JSON.parse(execFileSync("gh", ["api", "search/issues?q=repo:BuilderIO/agent-native+is:issue+is:open&sort=created&order=desc&per_page=50"], { encoding: "utf8" })).items;
const pick = issues.find(i => !i.pull_request && i.user?.type !== "Bot" && !/\[bot\]$/.test(i.user?.login || "") && !known.has(String(i.number)) && (i.body || "").length > 120);
if (!pick) { console.error("no new issue found"); process.exit(1); }
console.log(JSON.stringify({ action: "opened", issue: pick, repository: { id: repo.id, full_name: repo.full_name, name: repo.name, owner: { login: repo.owner.login }, html_url: repo.html_url } }));
