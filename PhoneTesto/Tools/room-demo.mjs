// The editor's page (Resources/room.html) as a stand-alone demo. Outside the
// plugin the page plays a song through a Web Audio sketch of the emulation, so
// the room can be tried by ear in a browser on this computer, or on a phone on
// the same Wi-Fi.
//
//   node Tools/room-demo.mjs [song.mp3] [--port 8080]

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const resources = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../Resources");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".ttf": "font/ttf",
                ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg" };

/** Serves the page at /, three.js, the models and the fonts beside it, and `song` as /song.mp3. */
export function createRoomServer({ song = null } = {}) {
  return http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = null;
    if (url === "/" || url === "/index.html") file = path.join(resources, "room.html");
    else if (url === "/three.min.js") file = path.join(resources, "thirdparty", "three.min.js");
    else if (/^\/[\w-]+\.(glb|jpg|hdr)$/.test(url)) file = path.join(resources, "models", url.slice(1));
    else if (url.startsWith("/fonts/")) file = path.join(resources, "fonts", path.basename(url));
    else if (url === "/song.mp3" && song) file = song;

    if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }

    const size = fs.statSync(file).size;
    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      // byte ranges, which Safari needs to play (and loop) audio
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`,
                           "accept-ranges": "bytes", "content-length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let port = 8080, song = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") port = Number(args[++i]);
    else if (args[i].trim()) song = path.resolve(args[i].trim());
  }
  if (song && !(fs.existsSync(song) && fs.statSync(song).isFile())) { console.error(`No such file: ${song}`); process.exit(1); }

  createRoomServer({ song }).listen(port, "0.0.0.0", () => {
    console.log(`PhoneTesto room demo${song ? ", playing " + path.basename(song) : " (choose a song on the page)"}`);
    console.log(`  on this computer:          http://localhost:${port}/`);
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || [])
        if (a.family === "IPv4" && !a.internal) console.log(`  on a phone (same Wi-Fi):   http://${a.address}:${port}/`);
  });
}
