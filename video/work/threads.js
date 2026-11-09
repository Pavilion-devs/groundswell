const puppeteer = require("puppeteer-core"); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
    defaultViewport: { width: 1600, height: 1000 }, userDataDir: require("os").homedir() + "/Library/Caches/groundswell-capture/profile" });
  const p = await b.newPage(); await p.goto("http://localhost:8080/chat", { waitUntil: "domcontentloaded" }); await sleep(7000);
  console.log((await p.evaluate(() => [...document.querySelectorAll("button.an-chat-history-row__button")].map(e => e.innerText.replace(/\s+/g, " ").slice(0, 100)))).join("\n"));
  await b.close();
})();
