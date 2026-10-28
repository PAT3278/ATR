// Loads the real player page in a real browser (Playwright Chromium, phone
// viewport) against PhoneTestoLiveDemo's 440 Hz tone, presses Play the way a
// user would, and checks the page actually decodes and schedules audio at
// the expected level -- for every quality setting, the screen-off mode, and
// the password flow.
//
//   node Tests/browser/player_test.mjs <path-to-PhoneTestoLiveDemo> [screenshot-dir]
//
// Chromium is not iPhone Safari: this proves the page/protocol logic, not
// iOS-specific audio behaviour.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const demoPath = process.argv[2];
const shotDir = process.argv[3] || "";
if (!demoPath) { console.error("usage: player_test.mjs <PhoneTestoLiveDemo> [screenshot-dir]"); process.exit(2); }
if (shotDir) mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`  [${ok ? " ok " : "FAIL"}] ${what}`); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startDemo(extraArgs = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(demoPath, ["--port", "0", "--rate", "44100", ...extraArgs], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    proc.stdout.on("data", d => {
      out += d;
      const m = out.match(/READY port=(\d+)/);
      if (m) resolve({ proc, port: +m[1] });
    });
    proc.on("exit", code => reject(new Error("demo exited " + code)));
  });
}

async function newPage(browser, locale = "en-US") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  return { context, page, errors };
}

const stats = page => page.evaluate(() => ({ ...window.__pt.stats }));

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

try {
  // ------------------------------------------------------------------------
  console.log("Low-latency mode, every quality");
  {
    const { proc, port } = await startDemo();
    const { context, page, errors } = await newPage(browser, "ja-JP");
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => document.getElementById("conn").classList.contains("ok"));
    check(await page.textContent("#status") === "タップして再生", "Japanese UI on a ja-JP phone");

    const opusOK = await page.evaluate(() => !document.querySelector('#quality option[value="opus-192"]').disabled);
    console.log(`  (this browser ${opusOK ? "can" : "cannot"} decode Opus via WebCodecs)`);

    for (const q of ["pcm16", "pcm24", "opus-192", "opus-96"]) {
      if (q.startsWith("opus") && !opusOK) { console.log(`  [skip] ${q}: no WebCodecs Opus here`); continue; }
      await page.selectOption("#quality", q);
      await page.click("#play");
      await sleep(3000);
      const s = await stats(page);
      if (q === "pcm16") {
        const icons = await page.evaluate(() => [getComputedStyle(document.getElementById("icon-play")).display,
                                                getComputedStyle(document.getElementById("icon-stop")).display]);
        check(icons[0] === "none" && icons[1] !== "none", `button shows the stop icon while playing (play:${icons[0]}, stop:${icons[1]})`);
      }
      check(s.state === "playing" && s.frames > 48000 * 2 && s.levelDb > -12 && s.levelDb < -6,
        `${q}: state=${s.state}, ${(s.frames / 48000).toFixed(1)} s scheduled, level ${s.levelDb.toFixed(1)} dBFS (sine at 0.5 -> -9), latency ${s.latencyMs} ms, underruns ${s.underruns}, dropped ${s.dropped}`);
      if (q === "pcm16" && shotDir) await page.screenshot({ path: path.join(shotDir, "player-playing.png"), fullPage: true });
      await page.click("#play");
      await sleep(300);
    }

    check(errors.length === 0, "no page/console errors while playing" + (errors.length ? ": " + errors.join(" | ") : ""));

    // The plugin restarting/closing mid-play: page should notice and keep
    // retrying (connection-refused logs from those retries are expected).
    await page.selectOption("#quality", "pcm16");
    await page.click("#play");
    await sleep(1500);
    proc.kill("SIGTERM");
    await sleep(2500);
    const afterKill = await stats(page);
    check(afterKill.state === "reconnecting" || afterKill.reconnects > 0, `notices the plugin going away (state=${afterKill.state})`);

    // ...and resumes on its own once the plugin is back on the same port.
    const again = spawn(demoPath, ["--port", String(port), "--rate", "44100"], { stdio: ["pipe", "ignore", "inherit"] });
    await sleep(4000);
    const resumed = await stats(page);
    check(resumed.state === "playing" && resumed.levelDb > -12, `resumes automatically when the plugin comes back (state=${resumed.state})`);
    await page.click("#play");
    again.kill("SIGTERM");
    await context.close();
  }

  // ------------------------------------------------------------------------
  console.log("Screen-off mode (native <audio> element + endless WAV)");
  {
    const { proc, port } = await startDemo();
    const { context, page, errors } = await newPage(browser);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.click("#modeBg");
    await page.click("#play");
    await sleep(4000);
    const el = await page.evaluate(() => { const a = document.getElementById("bg"); return { paused: a.paused, t: a.currentTime, err: a.error && a.error.code }; });
    const s = await stats(page);
    check(s.state === "playing" && !el.paused && el.t > 1.0,
      `audio element playing the live WAV: paused=${el.paused}, currentTime=${el.t.toFixed(2)} s, error=${el.err}`);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, "player-screenoff.png"), fullPage: true });
    await page.click("#play");
    check(errors.length === 0, "no page/console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
    await context.close();
    proc.kill("SIGTERM");
  }

  // ------------------------------------------------------------------------
  console.log("Password-protected stream");
  {
    const { proc, port } = await startDemo(["--password", "1234"]);
    const { context, page, errors } = await newPage(browser);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector("#authBox:not([hidden])");
    check(true, "password box shown on load");
    if (shotDir) await page.screenshot({ path: path.join(shotDir, "player-password.png"), fullPage: true });

    await page.click("#play");
    await sleep(500);
    check((await stats(page)).state !== "playing", "Play refuses to start without the password");

    await page.fill("#password", "9999");
    await page.click("#authForm button");
    await page.waitForFunction(() => document.getElementById("authError").textContent === "Wrong password");
    check(await page.isVisible("#authBox"), "wrong password rejected with \"" + await page.textContent("#authError") + "\"");

    await page.fill("#password", "1234");
    await page.click("#authForm button");
    await page.waitForSelector("#authBox", { state: "hidden" });
    check(true, "right password accepted");

    await page.click("#play");
    await sleep(2500);
    const s = await stats(page);
    check(s.state === "playing" && s.levelDb > -12, `plays after unlocking (level ${s.levelDb.toFixed(1)} dBFS)`);
    await page.click("#play");
    // The browser logs the deliberate wrong-password 401 itself; anything else is a real error.
    const unexpected = errors.filter(e => !/status of 401/.test(e));
    check(unexpected.length === 0, "no unexpected page/console errors" + (unexpected.length ? ": " + unexpected.join(" | ") : ""));
    await context.close();
    proc.kill("SIGTERM");
  }
} finally {
  await browser.close();
}

console.log(failures ? `\nFAILED: ${failures} check(s)` : "\nAll browser player checks passed.");
process.exit(failures ? 1 : 0);
