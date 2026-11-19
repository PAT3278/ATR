// The editor's page (Resources/room.html) in Playwright Chromium.
//
// 1. As a browser demo (no plugin): the room loads and draws with the bundled
//    three.js and fonts, a song plays through the page's sketch of the
//    emulation, a drag along the desk moves through the speakers and settles.
// 2. As the plugin's editor, against a stand-in for JUCE's bridge: it opens on
//    the air with the code to scan and no emulation controls; then what the page
//    sends the plugin -- the switch to the emulation, the morph while the user
//    moves and its end, model and mix changes, keyboard focus handed back after
//    mouse use, unused keys passed on to the host (Windows), nothing taken from
//    the password field.
// 3. Layout of the Live screen at a small, the default and a large window.
//
//   node Tests/browser/room_test.mjs [screenshot-dir]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createRoomServer } from "../../Tools/room-demo.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const shots = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a 30 s, 440 Hz + 2 kHz test "song"
const song = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "room-")), "song.wav");
{
  const rate = 44100, n = rate * 30, data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 4, 4); data.write("WAVEfmt ", 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28);
  data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / rate) + 5000 * Math.sin(2 * Math.PI * 2000 * i / rate));
    data.writeInt16LE(v, 44 + i * 4); data.writeInt16LE(v, 46 + i * 4);
  }
  fs.writeFileSync(song, data);
}

const server = createRoomServer({ song });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, what) => { console.log(`  [${ok ? " ok " : "FAIL"}] ${what}`); if (!ok) failures++; };

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                               "--autoplay-policy=no-user-gesture-required"] });
async function open(viewport, init) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(120000);
  const errors = [], missing = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400) missing.push(r.url()); });
  if (init) await page.addInitScript(init);
  await page.goto(base);
  await page.waitForFunction(() => window.THREE && document.querySelectorAll(".chip").length === 8);
  await page.waitForTimeout(2500);
  return { page, errors, missing };
}
async function drag(page, from, to, steps = 24) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await sleep(30); }
  await page.mouse.up();
}

try {
  // ---------------------------------------------------------------------
  console.log("As a browser demo");
  {
    const { page, errors, missing } = await open({ width: 1000, height: 660 });
    check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join("; ") : ""));
    check(missing.length === 0, "every file it asks for is served" + (missing.length ? ": " + missing.join(", ") : ""));
    check(await page.evaluate(() => document.fonts.check('600 20px "Barlow Condensed"')), "the bundled Barlow fonts load");

    const clip = { x: 380, y: 200, width: 240, height: 160 };
    const withDevices = await page.screenshot({ clip });
    await page.evaluate(() => { document.getElementById("dev").style.visibility = "hidden"; });
    const without = await page.screenshot({ clip });
    await page.evaluate(() => { document.getElementById("dev").style.visibility = ""; });
    check(Buffer.compare(withDevices, without) !== 0, "the speaker is drawn in 3D in the middle of the room");
    check(await page.evaluate(() => !document.getElementById("demo").hidden), "the song controls show outside the plugin");

    await page.click("#play");
    await page.waitForFunction(() => window.__ptRoom.level > 0.01, null, { timeout: 15000 }).catch(() => {});
    const playing = await page.evaluate(() => ({ level: window.__ptRoom.level, bands: (window.__ptRoom.bands || []).filter(v => v > 0.2).length,
                                                 pressed: document.getElementById("play").getAttribute("aria-pressed") }));
    check(playing.pressed === "true" && playing.level > 0.01 && playing.bands > 0,
          `the song plays through the sketch (level ${playing.level.toFixed(3)}, ${playing.bands} spectrum bands lit)`);

    await drag(page, [700, 300], [300, 300]);
    const during = await page.evaluate(() => window.__ptRoom.p);
    await page.waitForFunction(() => !window.__ptRoom.userMove && Number.isInteger(window.__ptRoom.p), null, { timeout: 60000 }).catch(() => {});
    const settled = await page.evaluate(() => ({ p: window.__ptRoom.p, move: window.__ptRoom.userMove, name: document.getElementById("name").textContent }));
    check(during > 3.2 && Number.isInteger(settled.p) && settled.p > 3 && !settled.move,
          `a drag along the desk moves through the speakers and settles on one (at ${during.toFixed(2)} during, ${settled.name} after)`);

    await page.click(".chip >> nth=6");
    await page.waitForFunction(() => document.getElementById("name").textContent === "Laptop Speakers");
    check(await page.evaluate(() => document.querySelector(".chip:nth-child(7)").getAttribute("aria-pressed")) === "true", "a model key moves the room to that speaker and marks it");

    await page.click("#mono");
    await page.waitForTimeout(400);
    check(await page.evaluate(() => document.getElementById("mono").getAttribute("aria-pressed")) === "true", "MONO latches");

    check(await page.evaluate(() => document.getElementById("listen").hidden), "the demo opens on the room (there's no network to play to)");
    await page.click("#toLive");
    await page.waitForFunction(() => !document.getElementById("listen").hidden);
    const live = await page.evaluate(() => ({ text: document.getElementById("liveCount").textContent, qr: !document.getElementById("qr").hidden,
                                              chips: getComputedStyle(document.getElementById("chips")).display }));
    check(live.qr && /plugin/i.test(live.text) && live.chips === "none",
          `LISTEN ON PHONE shows the code screen (marked as an example here) without the emulation's controls ("${live.text}")`);
    await page.click("#toEmulate");
    await page.waitForFunction(() => document.getElementById("listen").hidden);
    check(true, "SPEAKER EMULATION goes back to the room");
    await page.close();
  }

  // ---------------------------------------------------------------------
  console.log("As the plugin's editor (stand-in bridge, Windows)");
  {
    const init = () => {
      window.__sent = []; window.__stateFns = [];
      window.__JUCE__ = { backend: {
        emitEvent: (id, o) => window.__sent.push(JSON.parse(JSON.stringify(o))),
        addEventListener: (id, f) => { if (id === "state") window.__stateFns.push(f); } } };
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      const bits = Array.from({ length: 29 * 29 }, (_, i) => ((i * 7 + (i / 29 | 0) * 13) % 5 < 2 ? "1" : "0")).join("");
      window.__state = { mode: "live", device: 3, mix: 100, output: 100, mono: false, bypass: false, peak: [0.3, 0.3], dry: 0.3, bands: [],
                         live: { on: true, failed: false, url: "http://192.168.1.20:51813/?k=abc23def", listeners: 0, password: "", code: "abc23def", qr: bits, qrSize: 29 } };
      setInterval(() => window.__stateFns.forEach(f => f(JSON.parse(JSON.stringify(window.__state)))), 33);
    };
    const { page, errors } = await open({ width: 1000, height: 660 }, init);
    const sent = () => page.evaluate(() => window.__sent.splice(0));
    const of = (list, type) => list.filter(m => m.type === type);

    check((await page.evaluate(() => window.__sent.some(m => m.type === "ready"))), "it tells the plugin it's ready");
    check(await page.evaluate(() => document.getElementById("demo").hidden), "no song controls inside the plugin");

    // the first screen: the code to scan
    const first = await page.evaluate(() => {
      const shown = id => { const e = document.getElementById(id); return !e.hidden && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; };
      return { listen: shown("listen"), qr: Math.round(document.getElementById("qr").getBoundingClientRect().width), chips: shown("chips"),
               mix: shown("mix"), toEmulate: shown("toEmulate"), count: document.getElementById("liveCount").textContent,
               url: document.getElementById("liveUrl").textContent };
    });
    check(first.listen && first.qr >= 200 && !first.chips && !first.mix && first.toEmulate && first.count === "Waiting for a phone" && first.url.startsWith("http://"),
          `it opens on the air: the code (${first.qr} px), "${first.count}", the address; no emulation controls`);
    await sent();
    await page.keyboard.press("ArrowRight");
    let onAirKeys = await sent();
    check(!of(onAirKeys, "param").length && of(onAirKeys, "key").some(k => k.keyCode === 39), "on the air the arrows aren't the room's: they go on to the host");
    await page.evaluate(() => { window.__state.live.listeners = 2; });
    await page.waitForFunction(() => document.getElementById("liveCount").textContent === "2 phones listening");
    check(true, "the count follows the phones listening");

    await page.click("#toEmulate");
    onAirKeys = await sent();
    check(of(onAirKeys, "mode").some(m => m.live === false), "SPEAKER EMULATION asks the plugin to switch over");
    await page.evaluate(() => { window.__state.mode = "emulate"; window.__state.live = { on: false, failed: false, url: "", listeners: 0, password: "", code: "abc23def" }; });
    await page.waitForFunction(() => document.getElementById("listen").hidden && getComputedStyle(document.getElementById("chips")).display !== "none");
    check(true, "and the room comes back with its controls when it has");
    await page.waitForTimeout(500);
    await sent();

    await drag(page, [700, 300], [400, 300]);
    let list = await sent();
    const positions = of(list, "morph").filter(m => !m.end).map(m => m.pos);
    check(positions.length > 5 && Math.max(...positions) > 3.3, `while dragging it sends the camera's position for the sound to follow (${positions.length} positions, up to ${Math.max(...positions).toFixed(2)})`);
    check(of(list, "param").some(m => m.id === "device"), "and the model it lands on, for the host");
    check(of(list, "releaseFocus").length > 0, "letting go of the mouse hands keyboard focus back to the plugin");
    await page.waitForFunction(() => !window.__ptRoom.userMove, null, { timeout: 60000 }).catch(() => {});
    list = list.concat(await sent());
    check(of(list, "morph").some(m => m.end), "once the camera settles it ends the blend");

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !window.__ptRoom.userMove, null, { timeout: 60000 }).catch(() => {});
    list = await sent();
    const step = of(list, "param").filter(m => m.id === "device").pop();
    check(step && of(list, "morph").some(m => m.end), `the right arrow moves one speaker along (model ${step ? step.value : "none"}), sound following`);

    await page.keyboard.press("ArrowUp");
    list = await sent();
    check(of(list, "param").some(m => m.id === "mix"), "the up arrow pulls focus (mix)");

    await page.keyboard.down("Space"); await page.keyboard.up("Space");
    await page.keyboard.press("KeyS");
    list = await sent();
    const keys = of(list, "key");
    check(keys.some(k => k.keyCode === 32 && k.down) && keys.some(k => k.keyCode === 32 && !k.down) && keys.some(k => k.keyCode === 83),
          `keys the room doesn't use go on to the host (${keys.map(k => k.keyCode + (k.down ? "v" : "^")).join(" ")})`);

    await page.click("#toLive");
    list = await sent();
    check(of(list, "mode").some(m => m.live === true), "LISTEN ON PHONE asks the plugin to go back on the air");
    await page.evaluate(() => { window.__state.mode = "live"; window.__state.live = { on: true, failed: false, url: "http://192.168.1.20:51813/?k=abc23def", listeners: 0,
                                                        password: "", code: "abc23def", qr: "1".repeat(625), qrSize: 25 }; });
    await page.waitForFunction(() => !document.getElementById("listen").hidden);
    await page.evaluate(() => { window.__state.live.failed = true; window.__state.live.on = false; });
    await page.waitForFunction(() => !document.getElementById("retry").hidden);
    await page.click("#retry");
    list = await sent();
    check(of(list, "mode").some(m => m.live === true), "if the network refused, Try again asks once more");
    await page.evaluate(() => { window.__state.live.failed = false; window.__state.live.on = true; });
    await page.waitForFunction(() => document.getElementById("retry").hidden);
    await sent();
    await page.click("#pw");
    await page.keyboard.type("my pass");
    list = await sent();
    check(of(list, "releaseFocus").length === 0 && of(list, "key").length === 0 && of(list, "password").pop()?.value === "my pass",
          "typing a password keeps the keys (space included) in the field");
    check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join("; ") : ""));
    await page.close();
  }

  // ---------------------------------------------------------------------
  console.log("Layout of the Live screen");
  for (const [w, h] of [[720, 480], [1000, 660], [1600, 1000]]) {
    const { page } = await open({ width: w, height: h });
    await page.click("#toLive");
    await page.waitForFunction(() => !document.getElementById("listen").hidden);
    await page.waitForTimeout(800);
    const box = await page.evaluate(() => {
      const r = el => el.getBoundingClientRect();
      const stage = r(document.getElementById("stage")), card = r(document.querySelector(".listen-card")), qr = r(document.getElementById("qr"));
      const pw = r(document.getElementById("pw")), row = r(document.querySelector(".row")), air = r(document.getElementById("toEmulate"));
      const inside = [...document.querySelectorAll(".listen-text > *, #pw")].filter(e => !e.hidden)
        .every(e => { const b = r(e); return (b.width === 0 && b.height === 0) || (b.right <= card.right + 0.5 && b.left >= card.left - 0.5); });
      return { cardFits: card.bottom <= stage.bottom + 0.5 && pw.bottom <= card.bottom + 0.5 && card.right <= window.innerWidth && inside, qr: Math.round(qr.width),
               noSideScroll: document.documentElement.scrollWidth <= window.innerWidth, rowLines: Math.round(row.height / air.height),
               stageH: Math.round(stage.height) };
    });
    check(box.cardFits && box.noSideScroll && box.qr >= 140 && box.stageH > h * 0.6,
          `${w}x${h}: the card fits (code ${box.qr} px), ${box.stageH} px above the strip, its controls on ${box.rowLines} line(s), no sideways scroll`);
    if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `room-${w}x${h}.png`) }); }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures) { console.log(`\n${failures} room page check(s) failed.`); process.exit(1); }
console.log("\nAll room page checks passed.");
