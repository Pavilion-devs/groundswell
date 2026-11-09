// Send one message to the agent panel on a page as the local dev user, wait, print the panel text.
// node say.js <path> "<message>" [waitSeconds]
const puppeteer = require("puppeteer-core");
const path = require("path");
const [, , page, message, wait = "60"] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
    args: ["--window-size=1440,810"], defaultViewport: { width: 1440, height: 810 }, userDataDir: require("os").homedir() + "/Library/Caches/groundswell-capture/profile" });
  const p = await b.newPage();
  await p.goto("http://localhost:8080" + page, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(8000);
  if (!(await p.$(".agent-composer-prosemirror"))) {
    const t = await p.evaluateHandle(() => [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().top < 70 && b.getBoundingClientRect().width > 0)
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]);
    await t.asElement().click(); await sleep(1500);
  }
  await p.click(".agent-composer-prosemirror"); await p.keyboard.type(message); await p.keyboard.press("Enter");
  await sleep(Number(wait) * 1000);
  const txt = await p.evaluate(() => { const el = document.querySelector(".agent-composer-prosemirror")?.closest("aside, [class*=agent]") || document.body; return el.innerText; });
  console.log(txt.slice(-2500));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
