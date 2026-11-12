/*
 * Audio engine. Every place on the map is a channel:
 *
 *   source (audio file or sketch) ─► input ─┬─► analyser          (drives the visuals)
 *                                           └─► lowpass ─► pan ─► gain ─► master ─► limiter ─► out
 *
 * main.js sets each channel's gain / pan / lowpass from the player's distance and how long
 * they have stayed at the view, so a place is muffled and quiet from afar, opens up as you
 * walk in, and keeps getting louder while you stay and look.
 *
 * Places are "always playing": a channel only runs while you are near it, but its position in
 * the song is derived from a shared clock, so walking away and coming back resumes mid-song.
 */
(function () {
  'use strict';
  const SW = window.SW;

  class Channel {
    constructor(engine, song) {
      const ctx = engine.ctx;
      this.engine = engine;
      this.ctx = ctx;
      this.song = song;
      this.input = ctx.createGain();
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
      this.out.connect(engine.master);

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
        el.loop = true;
        el.preload = 'auto';
        el.src = this.song.src;
        el.addEventListener('error', () => {
          // The file is missing or blocked: fall back to the sketch so the place isn't silent.
          console.warn('[SoundWalk] could not load', this.song.src, '— playing the sketch instead');
          this.mode = 'sketch';
          this.usingFallback = true;
          if (this.playing) this.startSketch();
        });
        this.el = el;
        this.ctx.createMediaElementSource(el).connect(this.input);
      }
      const el = this.el;
      const sync = () => {
        if (isFinite(el.duration) && el.duration > 0) el.currentTime = (this.ctx.currentTime - this.engine.epoch) % el.duration;
        this.synced = true;   // from here on the element's own time is the song position
      };
      if (el.readyState >= 1) sync();
      else el.addEventListener('loadedmetadata', sync, { once: true });
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
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
      for (const ch of this.channels) ch.schedule(until);
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

  SW.Audio = Engine;
})();
