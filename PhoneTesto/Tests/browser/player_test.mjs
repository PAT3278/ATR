// Loads the real player page in a real browser (Playwright Chromium, phone
// viewport) against PhoneTestoLiveDemo's 440 Hz tone, presses Play the way a
// user would, and checks the page actually decodes and schedules audio at
// the expected level -- for every quality setting, the screen-off mode, and
// the password flow.
//
//   node Tests/browser/player_test.mjs <path-to-PhoneTestoLiveDemo> [screenshot-dir]
//
// Pages are opened through this machine's LAN address, the way a phone opens
// them -- a plain-HTTP, insecure context, where browsers withhold
// AudioWorklet, WebCodecs and Wake Lock -- and also via localhost (secure)
// for those paths. Chromium is not iPhone Safari: this proves the
// page/protocol logic, not iOS-specific audio behaviour.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

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

// The address a phone would use: this machine's non-loopback IPv4.
const lanAddress = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === "IPv4" && !a.internal)?.address;
if (!lanAddress) { console.error("no LAN address to test with"); process.exit(2); }

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

try {
  // ------------------------------------------------------------------------
  // A phone opens the plugin's plain-HTTP LAN address, which browsers treat
  // as an insecure context: no AudioWorklet, WebCodecs or Wake Lock. Test
  // that first, exactly as phones see it; then localhost (a secure context)
  // for the AudioWorklet/WebCodecs path.
  const { proc, port } = await startDemo();
  const contexts = [
    { host: lanAddress, label: "phone-like (LAN, insecure)", output: "script-processor", decoder: "wasm", keepAwake: ["video"] },
    { host: "127.0.0.1", label: "localhost (secure)", output: "worklet", decoder: "webcodecs", keepAwake: ["wake-lock", "video"] }, // headless Chromium denies wake locks -> video fallback
  ];
  let page, context, errors;

  for (const c of contexts) {
    console.log(`Low-latency mode, every quality -- ${c.label}`);
    ({ context, page, errors } = await newPage(browser, "ja-JP"));
    await page.goto(`http://${c.host}:${port}/`);
    await page.waitForFunction(() => document.getElementById("conn").classList.contains("ok"));
    const secure = await page.evaluate(() => isSecureContext);
    check(secure === (c.host === "127.0.0.1"), `secure context: ${secure}`);
    check(await page.textContent("#status") === "タップして再生", "Japanese UI on a ja-JP phone");

    const opusOK = await page.evaluate(() => !document.querySelector('#quality option[value="opus-192"]').disabled);
    check(opusOK, "Opus is available");

    for (const q of ["pcm16", "pcm24", "opus-192", "opus-96"]) {
      await page.selectOption("#quality", q);
      await page.click("#play");
      await sleep(3000);
      const s = await stats(page);
      const eng = await page.evaluate(() => ({ ...window.__pt.engine }));
      if (q === "pcm16") {
        const btn = await page.evaluate(() => [document.getElementById("play").getAttribute("aria-pressed"),
                                              document.getElementById("playText").textContent]);
        check(btn[0] === "true" && btn[1] === "Listening", `LISTEN lamp lit while playing (aria-pressed=${btn[0]}, "${btn[1]}")`);
        const fontsOk = await page.evaluate(() => document.fonts.check('700 20px "Barlow Condensed"'));
        check(fontsOk, "Barlow fonts load from the plugin");
        check(eng.output === c.output, `playback engine: ${eng.output} (want ${c.output})`);
        check(c.keepAwake.includes(eng.keepAwake), `keep-screen-on via: ${eng.keepAwake || "nothing"} (want ${c.keepAwake.join(" or ")})`);
      }
      if (q.startsWith("opus"))
        check(eng.decoder === c.decoder, `${q}: Opus decoded by ${eng.decoder} (want ${c.decoder})`);

      // Clicks: a clean 0.5-amplitude 440 Hz sine never exceeds 0.5 and never
      // moves more than 2*pi*440/rate*0.5 between samples. Chunk joins that
      // overlap or gap show up as spikes far above both.
      const wave = await page.evaluate(async () => {
        const p = window.__pt.player, an = p.analysers[0], a = new Float32Array(an.fftSize);
        let maxAbs = 0, maxJump = 0;
        for (let k = 0; k < 60; k++) {
          an.getFloatTimeDomainData(a);
          for (let i = 1; i < a.length; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(a[i]));
            maxJump = Math.max(maxJump, Math.abs(a[i] - a[i - 1]));
          }
          await new Promise(r => setTimeout(r, 17));
        }
        return { maxAbs, maxJump, rate: p.ctx.sampleRate };
      });
      const cleanJump = 2 * Math.PI * 440 / wave.rate * 0.5;
      check(wave.maxAbs < 0.56 && wave.maxJump < cleanJump * 1.5,
        `${q}: no clicks at ${wave.rate} Hz (peak ${wave.maxAbs.toFixed(3)}, want ~0.5; biggest step ${wave.maxJump.toFixed(4)}, clean sine ${cleanJump.toFixed(4)})`);

      check(s.state === "playing" && s.frames > 48000 * 2 && s.levelDb > -12 && s.levelDb < -6,
        `${q}: state=${s.state}, ${(s.frames / 48000).toFixed(1)} s received, level ${s.levelDb.toFixed(1)} dBFS (sine at 0.5 -> -9), latency ${s.latencyMs} ms, underruns ${s.underruns}, dropped ${s.dropped}`);
      if (q === "pcm16" && shotDir && c.output === "script-processor") await page.screenshot({ path: path.join(shotDir, "player-playing.png"), fullPage: true });
      await page.click("#play");
      await sleep(300);
    }

    check(errors.length === 0, "no page/console errors while playing" + (errors.length ? ": " + errors.join(" | ") : ""));
    await context.close();
  }

  // Reconnect behaviour, on the phone-like page.
  console.log("Plugin going away and coming back");
  {
    ({ context, page, errors } = await newPage(browser));
    await page.goto(`http://${lanAddress}:${port}/`);
    await page.waitForFunction(() => document.getElementById("conn").classList.contains("ok"));

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
    await page.goto(`http://${lanAddress}:${port}/`);
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
    await page.goto(`http://${lanAddress}:${port}/`);
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

    // Opening the QR code's URL (code in ?k=) should just play: no prompt.
    const fresh = await newPage(browser);
    await fresh.page.goto(`http://${lanAddress}:${port}/?k=1234`);
    await fresh.page.waitForFunction(() => document.getElementById("conn").classList.contains("ok"));
    await sleep(300);
    check(!(await fresh.page.isVisible("#authBox")), "QR URL with ?k= skips the password prompt");
    await fresh.page.click("#play");
    await sleep(2500);
    const viaQr = await stats(fresh.page);
    check(viaQr.state === "playing" && viaQr.levelDb > -12, `QR URL plays straight away (level ${viaQr.levelDb.toFixed(1)} dBFS)`);
    await fresh.page.click("#play");
    await fresh.context.close();

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
