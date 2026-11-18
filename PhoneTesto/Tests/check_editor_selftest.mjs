// Reads what the stand-alone app's editor self-test wrote (PHONETESTO_EDITOR_SELFTEST)
// and fails unless the room was really drawn: the web view was there, WebGL drew the
// speaker in the middle of a lit room, the fonts loaded, no script errors, and a
// snapshot was saved.
//
//   node Tests/check_editor_selftest.mjs <folder>

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const logFile = path.join(dir || "", "editor-selftest.txt");
if (!dir || !fs.existsSync(logFile)) { console.log(`No self-test log at ${logFile}: the editor never opened.`); process.exit(1); }

const log = fs.readFileSync(logFile, "utf8");
console.log(log);
const lines = log.split(/\r?\n/);
const reports = lines.map(l => l.replace(/^\S+\s/, "")).filter(l => l.startsWith("{")).map(l => { try { return JSON.parse(l); } catch { return {}; } });
const drawn = reports.find(r => r.kind === "rendered");
const errors = reports.filter(r => r.kind === "error");

const checks = [
  [log.includes("web view available"), "the system's web view is available"],
  [!!drawn, "the page reported a drawn frame"],
  [drawn && drawn.webgl && drawn.webgl !== "none", `WebGL is drawing (${drawn ? drawn.webgl : "-"})`],
  [drawn && drawn.speakerCover > 0.2, `the speaker fills the middle of the room (${drawn ? drawn.speakerCover : "-"})`],
  [drawn && drawn.lumaSpread > 4 && drawn.meanLuma > 3, `the picture isn't blank (mean ${drawn ? drawn.meanLuma : "-"}, spread ${drawn ? drawn.lumaSpread : "-"})`],
  [drawn && drawn.fonts, "the built-in fonts loaded"],
  [errors.length === 0, "no script errors" + (errors.length ? ": " + errors.map(e => e.message).join("; ") : "")],
  [fs.existsSync(path.join(dir, "editor-snapshot.png")), "a snapshot was saved"],
  [log.includes("self-test done"), "the self-test finished"],
];

let failed = 0;
for (const [ok, what] of checks) { console.log(`  [${ok ? " ok " : "FAIL"}] ${what}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
