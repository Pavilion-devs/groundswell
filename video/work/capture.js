// Scripted 1080p captures of the running Groundswell app (http://localhost:8080), adapted from the
// Gaugeless capture script. node capture.js <scene>   -> ../assets/clips/<scene>.mp4 (+ frames in cap/<scene>/)
// Viewport 1440x810 at device scale 4/3, so the UI reads larger and the output is 1920x1080.
const puppeteer = require("puppeteer-core");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const arg = (name, dflt) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : dflt; };
const BASE = arg("url", "http://localhost:8080");
const BOARD = arg("board", "brd_d2582de27a0f4fd083da");
const scene = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${scene} ${new Date().toISOString().slice(11, 19)}]`, ...a);

(async () => {
  const b = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new", args: ["--hide-scrollbars", "--window-size=1440,810"],
    defaultViewport: { width: 1440, height: 810, deviceScaleFactor: 4 / 3 }, userDataDir: require("os").homedir() + "/Library/Caches/groundswell-capture/profile",
  });
  const p = await b.newPage();
  p.on("pageerror", e => log("pageerror", e.message.slice(0, 160)));

  // a visible cursor, since headless Chrome draws none (re-added after every navigation)
  const CURSOR = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.2 L10.4 12.6 L16.5 12.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  let mx = 720, my = 600;
  const ensureCursor = () => p.evaluate((svg, x, y) => {
    if (document.getElementById("fakecursor")) return;
    const c = document.createElement("div"); c.id = "fakecursor"; c.innerHTML = svg;
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: `translate(${x}px,${y}px)` });
    document.documentElement.appendChild(c);
  }, CURSOR, mx, my).catch(() => {});
  const mv = async (x, y) => {
    await p.mouse.move(x, y);
    await p.evaluate((x, y) => { const c = document.getElementById("fakecursor"); if (c) c.style.transform = `translate(${x - 3}px,${y - 2}px)`; }, x, y).catch(() => {});
  };
  async function glide(x, y, steps = 26) {
    await ensureCursor();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await mv(mx + (x - mx) * e, my + (y - my) * e); await sleep(9);
    }
    mx = x; my = y;
  }
  async function find(selOrFn, text, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const h = await p.evaluateHandle((s, t) => {
        const els = [...document.querySelectorAll(s)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        return t ? els.find(e => e.textContent.replace(/\s+/g, " ").trim().includes(t) || (e.getAttribute("aria-label") || "").includes(t)) : els[0];
      }, selOrFn, text || null);
      if (h.asElement()) return h.asElement();
      await sleep(250);
    }
    throw new Error(`not found: ${selOrFn} ${text || ""}`);
  }
  async function center(el) { const bb = await el.boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; }
  async function click(sel, text, pause = 450) {
    const el = await find(sel, text); await el.evaluate(e => e.scrollIntoView({ block: "nearest", inline: "nearest" }));
    const [x, y] = await center(el); await glide(x, y);
    await sleep(160); await p.mouse.down(); await sleep(60); await p.mouse.up(); await sleep(pause);
  }
  async function drag(fromEl, toEl) {
    // HTML5 drag and drop: puppeteer's drag interception carries the dataTransfer between the events
    const [x1, y1] = await center(fromEl), [x2, y2] = await center(toEl);
    await glide(x1, y1); await sleep(200);
    await p.setDragInterception(true);
    await p.mouse.down();
    const data = await p.mouse.drag({ x: x1, y: y1 }, { x: x1 + 6, y: y1 + 6 });
    for (let i = 1; i <= 30; i++) { const t = i / 30, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await mv(x1 + (x2 - x1) * e, y1 + (y2 - y1) * e); await sleep(14); }
    await p.mouse.dragEnter({ x: x2, y: y2 }, data); await p.mouse.dragOver({ x: x2, y: y2 }, data); await sleep(250);
    await p.mouse.drop({ x: x2, y: y2 }, data); await p.mouse.up();
    await p.setDragInterception(false);
    mx = x2; my = y2; await sleep(900);
  }
  async function typeSlow(text, delay = 38) { for (const ch of text) { await p.keyboard.type(ch); await sleep(delay); } }
  async function openAgent() {
    if (await p.$(".agent-composer-prosemirror")) return;
    const btns = await p.$$(".dashboard-header ~ * button, header button, button");
    // the agent toggle is the right-most button in the top bar
    const toggle = await p.evaluateHandle(() => {
      const bs = [...document.querySelectorAll("button")].filter(b => { const r = b.getBoundingClientRect(); return r.top < 70 && r.width > 0; });
      return bs.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
    });
    const [x, y] = await center(toggle.asElement()); await glide(x, y); await p.mouse.click(x, y); await sleep(1200);
  }
  async function ask(text) {
    await openAgent();
    const ed = await find(".agent-composer-prosemirror");
    const [x, y] = await center(ed); await glide(x, y); await p.mouse.click(x, y); await sleep(200);
    await typeSlow(text); await sleep(400); await p.keyboard.press("Enter");
  }
  // action reads from Node with the page's cookies, so navigations in the page cannot break them
  async function api(name, params) {
    const cookie = (await p.cookies(BASE)).map(c => `${c.name}=${c.value}`).join("; ");
    const r = await fetch(`${BASE}/_agent-native/actions/${name}?` + new URLSearchParams(params), { headers: { cookie } });
    return r.json();
  }
  async function agentIdle(timeout = 600000) {
    // the agent panel shows a stop control while a turn runs; wait until it is gone for 4 s in a row
    const t0 = Date.now(); let quiet = 0;
    while (Date.now() - t0 < timeout) {
      const busy = await p.evaluate(() => !!document.querySelector('button[aria-label*="Stop" i], [data-agent-running="true"]')).catch(() => true);
      quiet = busy ? 0 : quiet + 1; if (quiet >= 8) return; await sleep(500);
    }
    log("agentIdle timeout");
  }

  // recording: CDP screencast frames with their timestamps, assembled by ffmpeg at their real durations
  const dir = path.join(__dirname, "cap", scene); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await p.createCDPSession(); const frames = []; const marks = [];
  cdp.on("Page.screencastFrame", async f => {
    const n = path.join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(n, Buffer.from(f.data, "base64")); frames.push([n, f.metadata.timestamp]);
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  let t0;
  const mark = label => { const t = (Date.now() / 1000) - t0; marks.push([label, +t.toFixed(2)]); log("mark", label, t.toFixed(1)); };
  // Screencast frames are in CSS pixels (1440 wide); device-pixel screenshots give a true 1920x1080, at
  // a lower frame rate. Close-up scenes use screenshots; the long time-lapse uses the screencast.
  const SHOTS = scene !== "sort";
  let recording = false, loop = null;
  async function shotLoop() {
    while (recording) {
      const t = Date.now() / 1000;
      try {
        const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1440, height: 810, scale: 4 / 3 } });
        const n = path.join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
        fs.writeFileSync(n, Buffer.from(r.data, "base64")); frames.push([n, t]);
      } catch { await sleep(30); }
    }
  }
  async function start() {
    t0 = Date.now() / 1000;
    if (SHOTS) { recording = true; loop = shotLoop(); return; }
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  async function stop() {
    if (SHOTS) { recording = false; await loop; } else await cdp.send("Page.stopScreencast");
    const end = Date.now() / 1000; let txt = "";
    frames.forEach(([n, t], i) => { const d = (i + 1 < frames.length ? frames[i + 1][1] : end) - t; txt += `file '${n}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`; });
    txt += `file '${frames[frames.length - 1][0]}'\n`;
    fs.writeFileSync(dir + ".txt", txt);
    const out = path.join(__dirname, "..", "assets", "clips", `${scene}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", dir + ".txt", "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out]);
    // marks are seconds from the first frame, for timing notes and rings in the scene
    const first = frames[0][1];
    fs.writeFileSync(path.join(__dirname, "cap", `${scene}.marks.json`), JSON.stringify(marks.map(([l, t]) => [l, +(t - (first - t0)).toFixed(2)]), null, 1));
    log("wrote", out, frames.length, "frames");
  }
  // load a page and wait until it stops reloading itself (dev-server recovery reloads after first load)
  async function go(url) {
    await p.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
    let stable = 0, last = null;
    for (let i = 0; i < 60 && stable < 4; i++) {
      await sleep(500);
      const id = await p.evaluate(() => (window.__gsLoadId ??= Math.random())).catch(() => null);
      stable = id !== null && id === last ? stable + 1 : 0; last = id;
    }
    await sleep(800); await ensureCursor();
  }

  const SCENES = {
    // The agent builds a new board from the repo and sorts it live.
    async sort() {
      const before = (await (await p.goto(BASE + "/_agent-native/actions/list-boards")).json()).boards.map(x => x.id);
      await go(`/boards/${BOARD}/dashboard`);
      await openAgent(); await sleep(800);
      await start(); await sleep(1200);
      mark("ask");
      await ask("Make a new board from the BuilderIO/agent-native GitHub issues, open it, and sort every issue into problems.");
      // follow the agent to the new board, then record until its sort runs finish
      let boardId = null; const tStart = Date.now();
      while (!boardId && Date.now() - tStart < 300000) {
        const list = (await api("list-boards", {})).boards || [];
        boardId = list.map(x => x.id).find(id => !before.includes(id)) || null; await sleep(2000);
      }
      log("new board", boardId);
      let sawSort = false, done = false;
      while (!done && Date.now() - tStart < 1500000) {
        await sleep(4000);
        if (!p.url().includes(boardId)) { /* the agent navigates; if not, open it ourselves once notes exist */ }
        const g = await api("get-board", { id: boardId });
        const runs = g.recentRuns || [];
        if (runs.some(r => r.kind === "classify")) sawSort = true;
        const running = runs.some(r => r.status === "running" || r.status === "queued");
        log("notes", g.counts?.notes, "sorted", g.counts?.sorted, "runs", runs.map(r => `${r.kind}:${r.status}`).join(","));
        if (sawSort && !running) { mark("sorted"); done = true; }
        if (!p.url().includes(boardId) && (g.counts?.notes ?? 0) > 0 && !p.url().includes(`/boards/${boardId}`)) {
          mark("open-board"); await go(`/boards/${boardId}`);
        }
      }
      await agentIdle(240000); mark("agent-done"); await sleep(3000);
      await stop();
      fs.writeFileSync(path.join(__dirname, "cap", "sort.board.txt"), boardId || "");
    },

    // Continue recording a sort already running on BOARD2 (the agent keeps working server-side).
    async sort2() {
      const id = arg("board2", "");
      await go(`/boards/${id}`); await openAgent(); await sleep(800);
      await start(); await sleep(1000); mark("resume");
      const t = Date.now();
      while (Date.now() - t < 1500000) {
        const g = await api("get-board", { id });
        const runs = g.recentRuns || [];
        log("notes", g.counts?.notes, "sorted", g.counts?.sorted, runs.map(r => `${r.kind}:${r.status}:${r.progress}/${r.total}`).join(","));
        if (runs.some(r => r.kind === "classify") && !runs.some(r => r.status === "running" || r.status === "queued")) break;
        await sleep(5000);
      }
      mark("sorted"); await agentIdle(240000); mark("agent-done"); await sleep(3000);
      await stop();
    },

    // The public landing page: hero, the snapshot board, the features.
    async landing() {
      await go("/"); await sleep(1500);
      await start(); await sleep(4500); mark("hero");
      for (let i = 0; i < 26; i++) { await p.mouse.wheel({ deltaY: 30 }); await sleep(40); }
      await sleep(2500); mark("board");
      for (let i = 0; i < 40; i++) { await p.mouse.wheel({ deltaY: 30 }); await sleep(40); }
      await sleep(2500); mark("features");
      await stop();
    },

    // A card's verified quote, then a problem's SQL score breakdown.
    async quotes() {
      await go(`/boards/${BOARD}`); await closeAgent(); await sleep(800);
      await start(); await sleep(1500);
      mark("card"); await click("[data-note-id]", "Let an action end the turn", 900);
      mark("drawer"); await sleep(1500);
      const m = await find("mark"); const [qx, qy] = await center(m); await glide(qx, qy + 14); await sleep(3500);
      await p.keyboard.press("Escape"); await sleep(900);
      mark("problem"); await click('button[title*="open brief and evidence"]', "Wants hooks to customize", 900);
      await sleep(1800);
      const bars = await find("div", "Why it ranks here"); const [bx, by] = await center(bars); await glide(bx + 160, by + 50); await sleep(4500);
      mark("end"); await p.keyboard.press("Escape"); await sleep(800);
      await stop();
    },

    // Three drags teach the agent; it proposes a revision, it is applied and the board re-sorts.
    async teach() {
      await go(`/boards/${BOARD}`); await closeAgent(); await sleep(800);
      await start(); await sleep(1200);
      const target = "Bugs in Plan, Content, Calendar, Mail and Design apps";
      for (const t of ["CRM: native adapter resets label", "Assets: uploads batched by file count", "Assets: brand kit Setup guide"]) {
        mark(`drag ${t}`); await dragAcross(t, target);
      }
      mark("teach-button"); await sleep(1500);
      await click("button", "Teach the agent", 1200);
      mark("ask-proposal"); await click("button", "Ask for a proposal", 800);
      // the agent reads the moves and proposes a revision
      const t1 = Date.now();
      while (Date.now() - t1 < 360000) {
        const r = await api("get-codebook-revision", { boardId: BOARD });
        if (r.proposal?.status === "proposed") break; await sleep(2500);
      }
      await agentIdle(120000); mark("proposal-ready"); await sleep(1500);
      await closeAgent(); await sleep(800);
      await click("button", "Review the agent's proposal", 1500);
      mark("review"); await sleep(2500);
      const body = await find("[role=dialog] .overflow-auto"); const [sx, sy] = await center(body); await glide(sx, sy);
      for (let i = 0; i < 24; i++) { await p.mouse.wheel({ deltaY: 40 }); await sleep(90); }
      await sleep(2000);
      for (let i = 0; i < 24; i++) { await p.mouse.wheel({ deltaY: -40 }); await sleep(30); }
      mark("apply"); await click("button", "Apply and re-sort", 1500);
      // the agent runs the targeted re-sort; record until the re-sort run finishes and the ripple plays
      const t2 = Date.now(); let resortId = null;
      while (Date.now() - t2 < 900000) {
        const g = await api("get-board", { id: BOARD });
        const rs = (g.recentRuns || []).find(r => r.kind === "resort");
        if (rs && rs.status === "succeeded" && Date.parse(rs.finishedAt) > t2) { resortId = rs.id; break; }
        await sleep(3000);
      }
      mark("resorted"); await sleep(1500);
      await closeAgent(); await sleep(6000); mark("ripple");
      const undo = await find("button", "Undo v"); const [ux, uy] = await center(undo); await glide(ux, uy); await sleep(2500);
      mark("end"); await stop();
      log("resort run", resortId);
    },

    // Part two of teaching (the drags are in teach-a): a fresh chat, the proposal, review, apply, re-sort, ripple.
    async teach2() {
      await go(`/boards/${BOARD}`);
      await openAgent(); await sleep(600);
      const nc = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find(b => /new chat/i.test(b.getAttribute("aria-label") || b.title || b.textContent)));
      if (nc.asElement()) { await nc.asElement().click(); await sleep(1200); log("new chat"); } else log("no new chat button");
      await closeAgent(); await sleep(800);
      await start(); await sleep(1500);
      mark("teach-button"); await click("button", "Teach the agent", 1200);
      mark("ask-proposal"); await click("button", "Ask for a proposal", 800);
      const t1 = Date.now(); let ok = false;
      while (Date.now() - t1 < 900000) {
        const r = await api("get-codebook-revision", { boardId: BOARD });
        if (r.proposal?.status === "proposed") { ok = true; break; } await sleep(3000);
      }
      log("proposal", ok); await agentIdle(180000); mark("proposal-ready"); await sleep(1500);
      await closeAgent(); await sleep(1000);
      await click("button", "Review the agent", 1500);
      mark("review"); await sleep(2500);
      const body = await find("[role=dialog] .overflow-auto"); const [sx, sy] = await center(body); await glide(sx, sy);
      for (let i = 0; i < 24; i++) { await p.mouse.wheel({ deltaY: 40 }); await sleep(90); }
      await sleep(2000);
      for (let i = 0; i < 24; i++) { await p.mouse.wheel({ deltaY: -40 }); await sleep(30); }
      mark("apply"); await click("button", "Apply and re-sort", 1500);
      const t2 = Date.now(); let resortId = null;
      while (Date.now() - t2 < 1200000) {
        const g = await api("get-board", { id: BOARD });
        const rs = (g.recentRuns || []).find(r => r.kind === "resort");
        if (rs && rs.status === "succeeded" && Date.parse(rs.finishedAt) > t2) { resortId = rs.id; break; }
        await sleep(3000);
      }
      mark("resorted"); await sleep(1500);
      await closeAgent(); await sleep(6000); mark("ripple");
      const undo = await find("button", "Undo v"); const [ux, uy] = await center(undo); await glide(ux, uy); await sleep(2500);
      mark("end"); await stop();
      log("resort run", resortId);
    },

    // Filing the saved brief (the writing is in ship-a): preview, set the sandbox repo, check it, confirm.
    async ship2() {
      const SANDBOX = "Pavilion-devs/groundswell-sandbox";
      await go(`/boards/${BOARD}`); await closeAgent(); await sleep(800);
      await start(); await sleep(1200);
      mark("open-problem"); await click('button[title*="open brief and evidence"]', "Wants hooks to customize", 1500);
      mark("brief"); await sleep(1500);
      const scroller = await find("[role=dialog] .overflow-auto"); const [sx, sy] = await center(scroller); await glide(sx, sy);
      for (let i = 0; i < 12; i++) { await p.mouse.wheel({ deltaY: 40 }); await sleep(120); }
      await sleep(1500);
      mark("file"); await click("button", "File as GitHub issue", 600);
      await find("div", "Preview: nothing has been posted", 30000); await sleep(1200);
      const repo = await find("#gs-repo"); const [rx, ry] = await center(repo); await glide(rx, ry);
      await repo.click({ clickCount: 3 }); await sleep(150);
      await repo.evaluate(e => { e.focus(); e.select(); });
      await p.keyboard.press("Backspace"); await sleep(100);
      await repo.type(SANDBOX, { delay: 45 }); await sleep(800);
      const val = await p.$eval("#gs-repo", e => e.value);
      if (val !== SANDBOX) throw new Error(`repo field is "${val}", not the sandbox; not filing`);
      mark("preview"); await sleep(1500);
      await click("button", "Continue to file", 1500);
      const confirmText = await p.evaluate(() => document.querySelector("[role=dialog]")?.innerText.match(/opens a public issue in ([^\s]+)/)?.[1]);
      if (confirmText !== SANDBOX) throw new Error(`confirmation names "${confirmText}", not the sandbox; not filing`);
      mark("confirm"); await click("button", `File in ${SANDBOX}`, 1000);
      const t2 = Date.now(); let url = null;
      while (Date.now() - t2 < 60000) {
        const top = (await api("get-priorities", { boardId: BOARD })).themes.find(t => t.rank === 1).themeId;
        const b = await api("get-brief", { boardId: BOARD, theme: top });
        if (b.brief?.filedIssueUrl) { url = b.brief.filedIssueUrl; break; } await sleep(1500);
      }
      mark("filed"); await sleep(4500);
      await stop();
      log("filed", url); fs.writeFileSync(path.join(__dirname, "cap", "ship.issue.txt"), url || "");
    },

    // The top problem: the agent writes the brief, it is previewed and filed in the sandbox repo.
    async ship() {
      await go(`/boards/${BOARD}`); await freshChat();
      await start(); await sleep(1200);
      mark("open-problem"); await click('button[title*="open brief and evidence"]', "Wants hooks to customize", 1200);
      mark("write"); await click("button", "Write the brief", 1000);
      const t1 = Date.now();
      while (Date.now() - t1 < 300000) {
        const r = await api("list-briefs", { boardId: BOARD });
        if ((r.briefs || []).some(x => /hooks/i.test(x.themeName || "") && Date.parse(x.createdAt) > t1 - 5000)) break; await sleep(2500);
      }
      await agentIdle(120000); mark("brief-saved"); await closeAgent(); await sleep(1500);
      // reopen so the drawer is in front with the brief
      await p.keyboard.press("Escape"); await sleep(600);
      await click('button[title*="open brief and evidence"]', "Wants hooks to customize", 1500);
      mark("brief"); await sleep(2000);
      const scroller = await find("[role=dialog] .overflow-auto"); const [sx, sy] = await center(scroller); await glide(sx, sy);
      for (let i = 0; i < 14; i++) { await p.mouse.wheel({ deltaY: 40 }); await sleep(110); }
      await sleep(1500);
      mark("file"); await click("button", "File as GitHub issue", 2500);
      const repo = await find("#gs-repo"); const [rx, ry] = await center(repo); await glide(rx, ry);
      await p.mouse.click(rx, ry, { clickCount: 3 }); await sleep(200); await p.keyboard.press("Backspace");
      await typeSlow("Pavilion-devs/groundswell-sandbox", 45); await sleep(800);
      mark("preview"); await sleep(1500);
      await click("button", "Continue to file", 1500);
      mark("confirm"); await click("button", "File in Pavilion-devs/groundswell-sandbox", 1000);
      const t2 = Date.now(); let url = null;
      while (Date.now() - t2 < 60000) {
        const b = await api("get-brief", { boardId: BOARD, theme: (await api("get-priorities", { boardId: BOARD })).themes.find(t => t.rank === 1).themeId });
        if (b.brief?.filedIssueUrl) { url = b.brief.filedIssueUrl; break; } await sleep(1500);
      }
      mark("filed"); await sleep(4000);
      await stop();
      log("filed", url); fs.writeFileSync(path.join(__dirname, "cap", "ship.issue.txt"), url || "");
    },

    // A real new GitHub issue arrives by webhook and sorts itself onto the board.
    async auto() {
      const autos = await p.goto(BASE + "/_agent-native/automations").then(r => r.json());
      const hook = autos.find(a => a.triggerType === "webhook" && a.enabled);
      const before = (await api("get-board", { id: BOARD })).counts.notes;
      await go(`/boards/${BOARD}/automations`); await freshChat();
      await start(); await sleep(2500);
      mark("automations");
      const card = await find("p", "New GitHub issues sort themselves"); const [cx, cy] = await center(card); await glide(cx, cy); await sleep(2500);
      // deliver the newest open issue that is not on the board, exactly as GitHub would
      const known = ((await api("list-notes", { boardId: BOARD, limit: 1000 })).notes || []).map(n => n.externalId);
      fs.writeFileSync(path.join(__dirname, "cap", "known.json"), JSON.stringify(known));
      const issue = JSON.parse(execFileSync("node", [path.join(__dirname, "newest-issue.js"), path.join(__dirname, "cap", "known.json")], { encoding: "utf8" }));
      log("delivering issue", issue.issue.number, issue.issue.title);
      mark("deliver");
      await p.evaluate(async (url, body) => {
        await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-github-event": "issues" }, body: JSON.stringify(body) });
      }, hook.webhookPath, issue);
      await sleep(1500);
      await go(`/boards/${BOARD}`); mark("board");
      const search = await find('input[placeholder^="Search"]'); const [qx, qy] = await center(search); await glide(qx, qy); await p.mouse.click(qx, qy);
      await typeSlow(issue.issue.title.split(" ").slice(0, 4).join(" "), 55);
      const t1 = Date.now(); let landed = null;
      while (Date.now() - t1 < 300000) {
        const n = await api("list-notes", { boardId: BOARD, limit: 1000 });
        const hit = (n.notes || []).find(x => x.externalId === String(issue.issue.number) || x.url === issue.issue.html_url);
        if (hit && hit.themeId) { landed = hit; break; } await sleep(2500);
      }
      mark("landed"); await sleep(5000);
      await stop();
      log("landed", landed?.id, landed?.themeId, "notes before", before);
      fs.writeFileSync(path.join(__dirname, "cap", "auto.issue.json"), JSON.stringify({ number: issue.issue.number, title: issue.issue.title, noteId: landed?.id }, null, 1));
    },
  };

  // Start a new main chat so agent requests from the UI never land in a busy or sub-agent thread.
  async function freshChat() {
    await openAgent(); await sleep(600);
    // close sub-agent tabs (e.g. "Re-sort slice 0/3") so the Main chat is the active one
    for (let i = 0; i < 8; i++) {
      const x = await p.$('button[aria-label="Close tab"]');
      if (!x) break;
      await x.click(); await sleep(500); log("closed a sub-agent tab");
    }
    const main = await p.evaluateHandle(() => [...document.querySelectorAll("button, [role=tab]")].find(e => (e.innerText || "").trim() === "Main" && e.getBoundingClientRect().left > 1000));
    if (main.asElement()) { await main.asElement().click(); await sleep(500); }
    const nc = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find(b => /new chat/i.test(b.getAttribute("aria-label") || b.title || b.textContent)));
    if (nc.asElement()) { await nc.asElement().click(); await sleep(1200); log("new chat"); } else log("no new chat button");
    await closeAgent(); await sleep(800);
  }
  async function closeAgent() {
    const h = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find(b => {
      const r = b.getBoundingClientRect(); return r.top < 50 && r.left > 1000 && r.width > 0 && /close|collapse/i.test(b.getAttribute("aria-label") || "") && b.closest("[class*=agent], aside, [data-agent-panel]");
    }));
    if (h.asElement()) { await h.asElement().click(); await sleep(700); }
  }
  // Drag a card from wherever it is to a column that may be off screen: grab it, scroll the board, drop.
  async function dragAcross(cardText, columnTitle) {
    const card = await find("[data-note-id]", cardText);
    await card.evaluate(e => e.scrollIntoView({ inline: "center", block: "center", behavior: "smooth" })); await sleep(1100);
    const [x1, y1] = await center(card); await glide(x1, y1); await sleep(250);
    await p.setDragInterception(true);
    const data = await p.mouse.drag({ x: x1, y: y1 }, { x: x1 + 8, y: y1 + 8 });
    await p.evaluate(t => document.querySelector(`section[aria-label^="${t}"]`).scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), columnTitle);
    for (let i = 0; i < 20; i++) { await mv(x1 + i * 2, y1 - i); await sleep(55); }
    mx = x1 + 40; my = y1 - 20;
    const col = await find("section", columnTitle); const bb = await col.boundingBox();
    const x2 = bb.x + bb.width / 2, y2 = bb.y + Math.min(bb.height / 2, 260);
    await glide(x2, y2, 30);
    await p.mouse.dragEnter({ x: x2, y: y2 }, data); await p.mouse.dragOver({ x: x2, y: y2 }, data); await sleep(350);
    await p.mouse.drop({ x: x2, y: y2 }, data); await p.mouse.up().catch(() => {});
    await p.setDragInterception(false);
    await sleep(1800);
  }

  if (!SCENES[scene]) throw new Error(`unknown scene ${scene}`);
  await SCENES[scene]();
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
