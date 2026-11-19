/*
 * Audio engine. Every place on the map is a channel:
 *
 *   audio file ─► gate ─┐
 *   sketch ─────────────┴─► input ─┬─► analyser          (drives the visuals)
 *                                  └─► lowpass ─► pan ─► gain ─► world ─► master ─► limiter ─► out
 *   the store player: its own channel per song, the same chain but straight into master, while world ducks under it
 *
 * main.js sets each channel's gain / pan / lowpass from the player's distance and how long
 * they have stayed at the view, so a place is muffled and quiet from afar, opens up as you
 * walk in, and keeps getting louder while you stay and look.
 *
 * Places are "always playing": a channel only runs while you are near it, but its position in
 * the song is derived from a shared clock, so walking away and coming back resumes mid-song.
 *
 * Previews: a song with access 'preview' (songs.js) that has not been bought on this device is never played through.
 * Its channel plays random excerpts of CONFIG.preview seconds instead, faded in and out on the gate (so the visuals,
 * which listen after the gate, go quiet with it), each from a new random point; at a place one follows another after a
 * short pause, in the store player one excerpt is one play. Sketches (no src) are stand-ins, so they always play.
 */
(function () {
  'use strict';
  const SW = window.SW;
  // Songs bought on this device (game.js fills it from storage after the shop server confirms the payment).
  SW.owned = SW.owned || {};
  SW.access = (song) => (song.access || SW.CONFIG.access || 'full') === 'preview' ? 'preview' : 'full';
  SW.isPreview = (song) => !!song.src && SW.access(song) === 'preview' && !SW.owned[song.id];
  const EX_IN = 0.9, EX_OUT = 2.2, EX_GAP = 1.6;   // excerpt fade in, fade out, and the pause before the next one at a place

  class Channel {
    // solo: the store player's own copy of the song. It starts from the top (or a fresh excerpt), plays once, and
    // goes straight to master so it is not ducked with the places.
    constructor(engine, song, solo) {
      const ctx = engine.ctx;
      this.engine = engine;
      this.ctx = ctx;
      this.song = song;
      this.solo = !!solo;
      this.input = ctx.createGain();
      this.gate = ctx.createGain();   // previews fade in and out here, ahead of the analyser
      this.gate.gain.value = SW.isPreview(song) ? 0 : 1;   // shut until the first excerpt has found its place
      this.gate.connect(this.input);
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.5;
      this.filter.frequency.value = 400;
      this.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -20;

      this.input.connect(this.analyser);
      this.input.connect(this.filter);
      if (this.panner) { this.filter.connect(this.panner); this.panner.connect(this.out); }
      else this.filter.connect(this.out);
      this.out.connect(solo ? engine.master : engine.world);

      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.wave = new Uint8Array(this.analyser.fftSize);
      this.f = { bass: 0, mid: 0, high: 0, level: 0, avg: 0.2, beat: false, pulse: 0, beats: 0, lastBeat: 0, spectrum: this.freq, wave: this.wave };

      this.playing = false;
      this.mode = song.src ? 'media' : 'sketch';
      this.sketch = SW.SKETCHES[song.sketch] || SW.SKETCHES.default;
      this.st = null;
      this.nextStep = 0;
      this.el = null;
      this.gain = 0;
      this.last = { gain: -1, pan: 9, cutoff: -1 };
      this.ex = null;       // the excerpt being heard: { a, b } in song seconds, st 'meta' | 'seek' | 'on' | 'out' | 'gap'
      this.lastEx = null;   // the last one, for the player to show where it was
      this.done = false;    // solo: reached the end (of the song, or of the excerpt)
    }

    start() {
      if (this.playing) return;
      this.playing = true;
      if (this.mode === 'media') this.startMedia();
      else this.startSketch();
    }

    stop() {
      if (!this.playing) return;
      this.playing = false;
      if (this.el) this.el.pause();
    }

    startSketch() {
      const ctx = this.ctx;
      if (!this.st) this.st = this.sketch.setup(ctx, this.input);
      const sd = 60 / this.sketch.bpm / 4;
      this.nextStep = Math.max(0, Math.ceil((ctx.currentTime + 0.06 - this.engine.epoch) / sd));
    }

    startMedia() {
      if (!this.el) {
        const el = new Audio();
        el.crossOrigin = 'anonymous';
        el.loop = !this.solo;
        el.preload = 'auto';
        el.src = this.song.src;
        el.addEventListener('error', () => {
          // The file is missing or blocked: fall back to the sketch so the place isn't silent.
          console.warn('[SoundWalk] could not load', this.song.src, '— playing the sketch instead');
          this.mode = 'sketch';
          this.usingFallback = true;
          if (this.playing) this.startSketch();
        });
        if (this.solo) el.addEventListener('ended', () => { this.done = true; });
        this.el = el;
        this.ctx.createMediaElementSource(el).connect(this.gate);
      }
      const el = this.el;
      if (SW.isPreview(this.song)) {
        if (this.solo && this.ex && this.ex.st !== 'gap' && this.ex.st !== 'meta') { const p = el.play(); if (p && p.catch) p.catch(() => {}); return; }   // the player resumes its excerpt
        this.excerpt();
        return;
      }
      this.ex = null;
      this.gateTo(1, 0.05);
      if (this.solo) {   // the player: from where it was paused, or from the top
        if (this.done || el.ended) { el.currentTime = 0; this.done = false; }
        const p = el.play(); if (p && p.catch) p.catch(() => {});
        return;
      }
      const sync = () => {
        if (isFinite(el.duration) && el.duration > 0) el.currentTime = (this.ctx.currentTime - this.engine.epoch) % el.duration;
        this.synced = true;   // from here on the element's own time is the song position
      };
      if (el.readyState >= 1) sync();
      else el.addEventListener('loadedmetadata', sync, { once: true });
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    }

    // A random stretch of the song, never close to the last one, faded in on the gate once the element is really there.
    excerpt() {
      const el = this.el;
      if (!(el.readyState >= 1 && isFinite(el.duration) && el.duration > 0)) {
        this.ex = { st: 'meta' };
        el.addEventListener('loadedmetadata', () => { if (this.playing && this.ex && this.ex.st === 'meta') this.excerpt(); }, { once: true });
        return;
      }
      const d = el.duration, len = Math.min(SW.CONFIG.preview || 20, d), room = Math.max(0, d - len), prev = this.lastEx;
      let a = 0;
      for (let i = 0; i < 8; i++) { a = Math.random() * room; if (!prev || Math.abs(a - prev.a) > len * 0.75) break; }
      this.ex = this.lastEx = { a, b: a + len, st: 'seek' };
      this.done = false;
      this.gateTo(0, 0.02);
      el.currentTime = a;
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      this.synced = true;
    }

    // Excerpt timing follows the element's own clock, so a stall while buffering only delays the fade.
    exTick() {
      const ex = this.ex, el = this.el;
      if (!ex || !el || !this.playing) return;
      const ct = el.currentTime;
      if (ex.st === 'seek') {
        if (!el.seeking && !el.paused && ct >= ex.a - 0.05 && ct < ex.b) {
          if (ct > ex.a) { ex.b = Math.min(el.duration, ex.b + ct - ex.a); ex.a = ct; }   // an mp3 seek can land a little late: the excerpt still gets its full length
          this.gateTo(1, EX_IN); ex.st = 'on';
        }
        else if (!el.seeking && Math.abs(ct - ex.a) > 1 && this.ctx.currentTime > (ex.retry || 0)) { ex.retry = this.ctx.currentTime + 0.3; el.currentTime = ex.a; }   // a server without byte ranges lets the seek land only once enough of the file is in
      }
      else if (ex.st === 'on') { if (ct >= ex.b - EX_OUT) { this.gateTo(0, Math.max(0.05, ex.b - ct)); ex.st = 'out'; } }
      else if (ex.st === 'out') {
        if (ct >= ex.b || el.ended) {
          el.pause(); ex.st = 'gap'; ex.until = this.ctx.currentTime + EX_GAP;
          if (this.solo) { this.ex = null; this.done = true; }   // in the player one excerpt is one play
        }
      } else if (ex.st === 'gap' && this.ctx.currentTime >= ex.until) this.excerpt();
    }

    gateTo(v, dur) {
      const g = this.gate.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + dur);
    }

    // Bought while it was playing as a preview: carry on from here, through to the end.
    unlock() {
      if (!this.ex) return;
      this.ex = null; this.gateTo(1, 0.6);
      if (this.playing && this.el && this.el.paused) { const p = this.el.play(); if (p && p.catch) p.catch(() => {}); }
    }

    // Is the song itself being heard right now (not loading, not between excerpts)?
    audible() {
      if (!this.playing) return false;
      if (this.mode !== 'media') return true;
      return !!this.el && !this.el.paused && this.el.readyState >= 3 && (!this.ex || this.ex.st === 'on' || this.ex.st === 'out');
    }

    schedule(until) {
      if (!this.playing || this.mode !== 'sketch') return;
      const ctx = this.ctx, sk = this.sketch;
      const sd = 60 / sk.bpm / 4;
      const epoch = this.engine.epoch;
      let guard = 64;
      while (epoch + this.nextStep * sd < until && guard--) {
        const n = this.nextStep++;
        const s = n % 16;
        const bar = Math.floor(n / 16) % sk.bars;
        let t = epoch + n * sd;
        if (s % 2 === 1) t += sk.swing * sd;
        if (t < ctx.currentTime) continue;
        sk.step(ctx, this.st, t, s, bar, sd);
      }
    }

    setTargets(gain, pan, cutoff) {
      const t = this.ctx.currentTime, L = this.last;
      this.gain = gain;
      if (Math.abs(gain - L.gain) > 0.002) { this.out.gain.setTargetAtTime(gain, t, 0.12); L.gain = gain; }
      if (this.panner && Math.abs(pan - L.pan) > 0.01) { this.panner.pan.setTargetAtTime(pan, t, 0.12); L.pan = pan; }
      if (Math.abs(cutoff - L.cutoff) / Math.max(1, L.cutoff) > 0.02) { this.filter.frequency.setTargetAtTime(cutoff, t, 0.12); L.cutoff = cutoff; }
    }

    // Spectrum features for the visuals (bass / mid / high 0..1, level, simple kick detection).
    analyse(dt, now) {
      const f = this.f;
      if (!this.playing) {
        f.bass *= 0.9; f.mid *= 0.9; f.high *= 0.9; f.level *= 0.9; f.beat = false; f.pulse *= 0.9;
        return f;
      }
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.wave);
      const fr = this.freq;
      const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += fr[i]; return s / (b - a) / 255; };
      f.bass = avg(1, 4);
      f.mid = avg(5, 46);
      f.high = avg(60, 240);
      let sum = 0;
      for (let i = 0; i < this.wave.length; i += 4) { const v = (this.wave[i] - 128) / 128; sum += v * v; }
      f.level = Math.min(1, Math.sqrt(sum / (this.wave.length / 4)) * 2.2);
      const k = 1 - Math.exp(-dt / 0.45);
      f.beat = f.bass > 0.42 && f.bass > f.avg * 1.12 + 0.03 && now - f.lastBeat > 0.22;
      f.avg += (f.bass - f.avg) * k;
      if (f.beat) { f.lastBeat = now; f.beats++; f.pulse = 1; }
      else f.pulse *= Math.exp(-dt * 6);
      return f;
    }
  }

  const Engine = {
    ctx: null,
    master: null,
    channels: [],
    volume: 0.9,
    muted: false,
    epoch: 0,
    started: false,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ } }
      const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));
      SW.Kit.init(ctx);
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8;
      lim.knee.value = 6;
      lim.ratio.value = 10;
      lim.attack.value = 0.003;
      lim.release.value = 0.2;
      this.master.connect(lim).connect(ctx.destination);
      this.world = ctx.createGain();   // every place; ducks while the store player plays
      this.world.connect(this.master);
      this.epoch = ctx.currentTime + 0.1;
      this.channels = SW.SONGS.map((s) => new Channel(this, s));
      this.timer = setInterval(() => this.tick(), 25);
      this.started = true;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else this.ctx.resume();
      });
    },

    resume() {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },

    tick() {
      const until = this.ctx.currentTime + 0.15;
      for (const ch of this.channels) { ch.schedule(until); ch.exTick(); }
      for (const id in Player.chs) { const ch = Player.chs[id]; ch.schedule(until); ch.exTick(); }
      Player.tick();
    },

    duck(on) { if (this.world) this.world.gain.setTargetAtTime(on ? 0.12 : 1, this.ctx.currentTime, 0.25); },

    // A song was bought on this device: whatever is playing it as a preview carries on in full.
    unlock(id) {
      for (const ch of this.channels) if (ch.song.id === id) ch.unlock();
      if (Player.chs[id]) Player.chs[id].unlock();
    },

    // A waveform this device has already worked out (see peaks), without reading the file.
    cachedPeaks(song) {
      if (!song.src) return null;
      try { const c = JSON.parse(localStorage.getItem('soundwalk-peaks:' + song.src) || 'null'); return Array.isArray(c) && c.length ? c : null; } catch (e) { return null; }
    },

    // The waveform for the store player: the real one, decoded once at a low sample rate (light enough for a phone)
    // and kept on the device. Resolves to n bars 0..1, or null if the file cannot be read.
    peaks(song, n = 120) {
      const src = song.src, memo = (this.pk = this.pk || {});
      if (!src) return Promise.resolve(null);
      if (memo[src]) return memo[src];
      const key = 'soundwalk-peaks:' + src;
      return (memo[src] = (async () => {
        try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(c) && c.length === n) return c; } catch (e) { /* storage blocked */ }
        try {
          const buf = await (await fetch(src)).arrayBuffer();
          const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const decode = (ctx, b) => new Promise((ok, ng) => { const r = ctx.decodeAudioData(b, ok, ng); if (r && r.then) r.then(ok, ng); });
          let ab = null;
          for (const rate of [8000, 22050]) { try { ab = await decode(new OAC(1, 1, rate), buf.slice(0)); break; } catch (e) { /* that rate is not supported here */ } }
          if (!ab) ab = await decode(this.ctx, buf);
          const d = ab.getChannelData(0), per = Math.max(1, Math.floor(d.length / n)), step = Math.max(1, Math.floor(per / 400)), out = [];
          let top = 0;
          for (let i = 0; i < n; i++) { let m = 0; for (let j = i * per, e = Math.min(d.length, j + per); j < e; j += step) { const v = Math.abs(d[j]); if (v > m) m = v; } out.push(m); top = Math.max(top, m); }
          const res = out.map((v) => Math.round((v / (top || 1)) * 100) / 100);
          try { localStorage.setItem(key, JSON.stringify(res)); } catch (e) { /* full or blocked: decode again next time */ }
          return res;
        } catch (e) { return null; }
      })());
    },

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    },

    // Short two-note chime when a new place is found.
    chime() {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime + 0.02;
      [76, 83].forEach((n, i) => {
        SW.Kit.voice(ctx, this.master, t + i * 0.11, SW.mtof(n), 0.25, { type: 'triangle', vol: 0.08, a: 0.004, d: 0.4, s: 0, r: 0.4 });
      });
    },
  };

  // The store player (the record shop's counter and the phone): one song at a time, on its own channel for that song,
  // so it starts at the top (or, for a preview, at a fresh excerpt) whatever the place itself is playing.
  const Player = {
    chs: {},
    ch: null,
    song: null,
    state: 'stop',   // 'play' | 'pause' | 'stop'
    channel(song) { return (this.chs[song.id] = this.chs[song.id] || new Channel(Engine, song, true)); },
    play(song) {
      if (!Engine.ctx) return;
      if (this.song && this.song !== song) this.stop();
      const now = Engine.ctx.currentTime;   // how long a sketch has been playing (it loops, so it has no length of its own)
      this.since = this.state === 'pause' ? this.since + now - this.pausedAt : now;
      const ch = this.channel(song);
      this.ch = ch; this.song = song;
      ch.last.gain = -1; ch.setTargets(1, 0, 20000);
      if (ch.done) ch.ex = null;
      ch.start();
      this.state = 'play';
      Engine.duck(true);
    },
    pause() {
      if (this.state !== 'play') return;
      this.ch.stop(); this.state = 'pause'; this.pausedAt = Engine.ctx.currentTime;
      Engine.duck(false);
    },
    toggle(song) { if (this.song === song && this.state === 'play') this.pause(); else this.play(song); },
    stop() {
      const ch = this.ch;
      if (ch) { ch.stop(); ch.ex = null; ch.done = true; ch.setTargets(0, 0, 20000); }
      this.state = 'stop';
      Engine.duck(false);
    },
    // Full songs only: jump to a point (0..1) in the track. A preview cannot be scrubbed.
    seek(song, k) {
      const ch = this.channel(song);
      if (SW.isPreview(song) || ch.mode !== 'media') return false;
      if (this.song !== song || this.state === 'stop') this.play(song);
      const el = ch.el, go = () => { el.currentTime = Math.max(0, Math.min(0.999, k)) * el.duration; ch.done = false; };
      if (el.readyState >= 1 && isFinite(el.duration)) go(); else el.addEventListener('loadedmetadata', go, { once: true });
      return true;
    },
    tick() { if (this.state === 'play' && this.ch && this.ch.done) { this.ch.stop(); this.state = 'stop'; Engine.duck(false); } },
    // What the player UI shows: where it is, how long, and which kind of play it is.
    info(song) {
      const ch = this.chs[song.id], on = this.song === song ? this.state : 'stop';
      const pv = SW.isPreview(song), len = SW.CONFIG.preview || 20;
      if (!ch || ch.mode !== 'media') {
        if (song.src && !(ch && ch.usingFallback)) return { state: on, demo: false, preview: pv, t: 0, dur: song.length || 0, len, a: null };   // not loaded yet
        const sk = SW.SKETCHES[song.sketch] || SW.SKETCHES.default, loop = (sk.bars * 16 * 60) / sk.bpm / 4;
        const t = on === 'play' && Engine.ctx ? (((Engine.ctx.currentTime - Engine.epoch) % loop) + loop) % loop : 0;
        const el = on === 'stop' || !Engine.ctx ? 0 : (on === 'play' ? Engine.ctx.currentTime : this.pausedAt) - this.since;
        return { state: on, demo: true, preview: false, t, dur: loop, len: loop, a: null, el };
      }
      const el = ch.el, dur = el && isFinite(el.duration) ? el.duration : song.length || 0, ex = ch.ex || ch.lastEx;
      const waiting = on === 'play' && (!el || el.readyState < 3 || (ch.ex && ch.ex.st !== 'on' && ch.ex.st !== 'out'));
      return { state: on, demo: false, preview: pv, t: el ? el.currentTime : 0, dur, len: pv ? Math.min(len, dur || len) : dur, a: pv && ex ? ex.a : null, waiting };
    },
  };
  Engine.player = Player;

  SW.Audio = Engine;
})();
