// Call a GET action as the local dev user (cookies from the capture profile). node act.js <action> '<json params>'
const puppeteer = require("puppeteer-core"); const path = require("path");
(async () => {
  const [, , name, params = "{}"] = process.argv;
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", userDataDir: require("os").homedir() + "/Library/Caches/groundswell-capture/profile" });
  const p = await b.newPage();
  const cookie = (await p.cookies("http://localhost:8080")).map(c => `${c.name}=${c.value}`).join("; ");
  await b.close();
  const r = await fetch(`http://localhost:8080/_agent-native/actions/${name}?` + new URLSearchParams(JSON.parse(params)), { headers: { cookie } });
  console.log(JSON.stringify(await r.json()));
})().catch(e => { console.error(e.message); process.exit(1); });
