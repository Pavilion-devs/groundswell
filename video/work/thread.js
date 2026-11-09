// Print the text of the most recent agent conversation whose title matches a pattern. node thread.js "<pattern>"
const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
    defaultViewport: { width: 1600, height: 1000 }, userDataDir: require("os").homedir() + "/Library/Caches/groundswell-capture/profile" });
  const p = await b.newPage();
  await p.goto("http://localhost:8080/chat", { waitUntil: "domcontentloaded" }); await sleep(7000);
  const ok = await p.evaluate(pat => { const el = [...document.querySelectorAll("button.an-chat-history-row__button")].find(e => new RegExp(pat, "i").test(e.textContent)); if (el) { el.click(); return el.textContent.slice(0, 80); } return null; }, process.argv[2]);
  console.log("thread:", ok); await sleep(6000);
  console.log(await p.evaluate(() => document.querySelector("main")?.innerText || ""));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
