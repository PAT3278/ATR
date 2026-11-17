// The editor's page (Resources/room.html) in Playwright Chromium, outside the
// plugin: with no JUCE backend the page runs against its built-in stand-in,
// so this checks that the 3D room loads and draws with the bundled three.js
// and fonts, that the controls respond, and that ON AIR shows the code card.
//
//   node Tests/browser/room_test.mjs [screenshot-dir]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../Resources");
const shots = process.argv[2];
const files = {
  "/": ["room.html", "text/html; charset=utf-8"],
  "/three.min.js": ["thirdparty/three.min.js", "text/javascript"],
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let entry = files[url];
  if (!entry && url.startsWith("/fonts/")) entry = ["fonts/" + path.basename(url), "font/ttf"];
  const file = entry && path.join(root, entry[0]);
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": entry[1] });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, what) => { console.log(`  [${ok ? " ok " : "FAIL"}] ${what}`); if (!ok) failures++; };

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 660 } });
  page.setDefaultTimeout(120000);
  const errors = [], missing = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400) missing.push(r.url()); });
  await page.goto(base);
  await page.waitForFunction(() => window.THREE && document.querySelectorAll(".chip").length === 8);
  await page.waitForTimeout(4000);

  console.log("Room page");
  check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join("; ") : ""));
  check(missing.length === 0, "every file it asks for is served" + (missing.length ? ": " + missing.join(", ") : ""));
  check(await page.evaluate(() => document.fonts.check('600 20px "Barlow Condensed"')), "the bundled Barlow fonts load");

  // the 3D layers really draw: hiding the speakers' layer changes the middle of the picture
  const clip = { x: 380, y: 200, width: 240, height: 160 };
  const withDevices = await page.screenshot({ clip });
  await page.evaluate(() => { document.getElementById("dev").style.visibility = "hidden"; });
  const without = await page.screenshot({ clip });
  await page.evaluate(() => { document.getElementById("dev").style.visibility = ""; });
  check(Buffer.compare(withDevices, without) !== 0, "the speaker is drawn in 3D in the middle of the room");

  await page.click(".chip >> nth=6");
  await page.waitForFunction(() => document.getElementById("name").textContent === "Laptop Speakers");
  check(true, "a model key moves the room to that speaker");
  check(await page.evaluate(() => document.querySelector(".chip:nth-child(7)").getAttribute("aria-pressed")) === "true", "and marks it");

  await page.click("#mono");
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.getElementById("mono").getAttribute("aria-pressed")) === "true", "MONO latches");

  check(await page.evaluate(() => document.getElementById("live").hidden), "the Live card is hidden while off the air");
  await page.click("#air");
  await page.waitForFunction(() => !document.getElementById("live").hidden);
  const live = await page.evaluate(() => ({
    url: document.getElementById("liveUrl").textContent,
    qr: !document.getElementById("qr").hidden,
    pressed: document.getElementById("air").getAttribute("aria-pressed"),
  }));
  check(live.qr && live.url.startsWith("http://") && live.pressed === "true", "ON AIR shows the code to scan and its address");
  if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, "room-live.png") }); }
} finally {
  await browser.close();
  server.close();
}

if (failures) { console.log(`\n${failures} room page check(s) failed.`); process.exit(1); }
console.log("\nAll room page checks passed.");
