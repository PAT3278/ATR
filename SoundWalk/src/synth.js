/*
 * A tiny Web Audio instrument kit, and the generative "sketch" loops that play
 * at a place until a real audio file is set for it in songs.js.
 *
 * Each sketch is a 16-step-per-bar pattern. step() is called just ahead of time
 * by the scheduler in audio.js with the exact AudioContext time of the step.
 * Randomness is hashed from (bar, step), so every loop repeats identically.
 */
(function () {
  'use strict';
  const SW = (window.SW = window.SW || {});

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function hash(a, b, c) {
    let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263) ^ Math.imul(c + 13, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const Kit = {
    noiseBuf: null,
    crackleBuf: null,
    driveCurve: null,

    init(ctx) {
      const len = ctx.sampleRate * 2;
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const n = nb.getChannelData(0);
      for (let i = 0; i < len; i++) n[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;

      const cb = ctx.createBuffer(1, len, ctx.sampleRate);
      const c = cb.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const pop = Math.random() < 0.00035 ? (Math.random() * 2 - 1) * 0.8 : 0;
        c[i] = pop + (Math.random() * 2 - 1) * 0.01;
      }
      this.crackleBuf = cb;

      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4);
      }
      this.driveCurve = curve;
    },

    noise(ctx, t, dur) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.start(t, Math.random() * 1.5, dur + 0.05);
      return s;
    },

    // One gain envelope: attack to vol, decay towards vol*sustain, release at t+dur.
    env(g, t, vol, a, d, s, dur, r) {
      const p = g.gain;
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(vol, t + a);
      p.setTargetAtTime(vol * s, t + a, Math.max(0.001, d / 3));
      p.setTargetAtTime(0, t + Math.max(dur, a), Math.max(0.001, r / 3));
    },

    kick(ctx, out, t, o = {}) {
      const vol = o.vol ?? 0.85, dec = o.decay ?? 0.35;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(o.f0 ?? 150, t);
      osc.frequency.exponentialRampToValueAtTime(o.f1 ?? 45, t + (o.sweep ?? 0.08));
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dec + 0.02);
    },

    snare(ctx, out, t, o = {}) {
      const vol = o.vol ?? 0.4, dec = o.decay ?? 0.16;
      const n = this.noise(ctx, t, dec);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = o.freq ?? 1800;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      n.connect(bp).connect(g).connect(out);
      const tone = o.tone ?? 190;
      if (tone) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(tone * 1.6, t);
        osc.frequency.exponentialRampToValueAtTime(tone, t + 0.03);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(vol * 0.7, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(g2).connect(out);
        osc.start(t);
        osc.stop(t + 0.12);
      }
    },

    hat(ctx, out, t, o = {}) {
      const vol = o.vol ?? 0.12, dec = o.decay ?? 0.04;
      const n = this.noise(ctx, t, dec);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.freq ?? 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      n.connect(hp).connect(g).connect(out);
    },

    clap(ctx, out, t, o = {}) {
      const vol = o.vol ?? 0.35, dec = o.decay ?? 0.18;
      const n = this.noise(ctx, t, dec + 0.04);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = o.freq ?? 1150;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      const p = g.gain;
      p.setValueAtTime(vol, t);
      p.exponentialRampToValueAtTime(0.05, t + 0.01);
      p.setValueAtTime(vol, t + 0.012);
      p.exponentialRampToValueAtTime(0.05, t + 0.022);
      p.setValueAtTime(vol, t + 0.025);
      p.exponentialRampToValueAtTime(0.001, t + 0.025 + dec);
      n.connect(bp).connect(g).connect(out);
    },

    click(ctx, out, t, o = {}) {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'triangle';
      osc.frequency.value = o.freq ?? 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.vol ?? 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (o.decay ?? 0.03));
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + (o.decay ?? 0.03) + 0.02);
    },

    crash(ctx, out, t, o = {}) {
      const dec = o.decay ?? 1.4;
      const n = this.noise(ctx, t, dec);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.vol ?? 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dec);
      n.connect(hp).connect(g).connect(out);
    },

    riser(ctx, out, t, dur, o = {}) {
      const n = this.noise(ctx, t, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol ?? 0.12, t + dur * 0.95);
      g.gain.linearRampToValueAtTime(0, t + dur);
      n.connect(bp).connect(g).connect(out);
    },

    /*
     * General-purpose synth voice. Returns the voice's output gain so callers can
     * also send it to an effect.
     *  o.type    oscillator type          o.detune  array of cents (unison)
     *  o.vol     peak level               o.a/d/s/r envelope (s = sustain fraction)
     *  o.cutoff  lowpass Hz (optional)    o.fenv    filter starts at cutoff*fenv
     *  o.fdec    filter env time          o.glide   {from: Hz, time: s}
     *  o.drive   soft saturation
     */
    voice(ctx, out, t, freq, dur, o = {}) {
      const g = ctx.createGain();
      const dets = o.detune || [0];
      const vol = (o.vol ?? 0.1) / Math.sqrt(dets.length);
      const a = o.a ?? 0.005, d = o.d ?? 0.2, s = o.s ?? 0.5, r = o.r ?? 0.1;
      this.env(g, t, vol, a, d, s, dur, r);
      let input = g;
      if (o.cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = o.q ?? 0.8;
        const fe = o.fenv ?? 1;
        f.frequency.setValueAtTime(Math.min(18000, o.cutoff * fe), t);
        if (fe !== 1) f.frequency.exponentialRampToValueAtTime(o.cutoff, t + (o.fdec ?? 0.15));
        f.connect(g);
        input = f;
      }
      if (o.drive) {
        const ws = ctx.createWaveShaper();
        ws.curve = this.driveCurve;
        ws.connect(input);
        input = ws;
      }
      const stop = t + dur + r * 2 + 0.05;
      for (const cents of dets) {
        const osc = ctx.createOscillator();
        osc.type = o.type ?? 'sine';
        if (o.glide) {
          osc.frequency.setValueAtTime(o.glide.from, t);
          osc.frequency.exponentialRampToValueAtTime(freq, t + o.glide.time);
        } else {
          osc.frequency.setValueAtTime(freq, t);
        }
        osc.detune.value = cents;
        osc.connect(input);
        osc.start(t);
        osc.stop(stop);
      }
      g.connect(out);
      return g;
    },

    // A feedback delay whose wet signal goes to dest. Returns its input (a send).
    delay(ctx, dest, time, feedback, cutoff, level) {
      const send = ctx.createGain();
      send.gain.value = level ?? 0.5;
      const d = ctx.createDelay(2);
      d.delayTime.value = time;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff ?? 3000;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      send.connect(d);
      d.connect(f);
      f.connect(fb);
      fb.connect(d);
      f.connect(dest);
      return send;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Sketches                                                            */
  /* ------------------------------------------------------------------ */

  // Every sketch gets a bus (-> its channel), a delay send and anything else it set up.
  function baseSetup(ctx, out, bpm, opts = {}) {
    const bus = ctx.createGain();
    bus.gain.value = opts.gain ?? 1;
    let tail = bus;
    if (opts.tone) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.tone;
      lp.Q.value = 0.4;
      bus.connect(lp);
      tail = lp;
    }
    tail.connect(out);
    const beat = 60 / bpm;
    const send = Kit.delay(ctx, out, beat * 0.75, opts.fb ?? 0.35, opts.fcut ?? 2800, opts.wet ?? 0.6);
    return { bus, send };
  }

  const SKETCHES = {};

  /* KEYAKI — warm lo-fi: swung boom-bap, electric-piano chords, leafy pentatonic plinks, vinyl crackle. */
  SKETCHES.keyaki = {
    bpm: 82, swing: 0.2, bars: 4,
    setup(ctx, out) {
      const st = baseSetup(ctx, out, this.bpm, { tone: 5200, fb: 0.38 });
      const cr = ctx.createBufferSource();
      cr.buffer = Kit.crackleBuf;
      cr.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      cr.connect(hp).connect(g).connect(st.bus);
      cr.start();
      return st;
    },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const chords = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 66], [50, 53, 57, 60, 64], [55, 60, 62, 65, 69]];
      const roots = [41, 40, 38, 43];
      const ch = chords[bar], root = roots[bar];

      if (s === 0 || s === 7 || s === 10) K.kick(ctx, b, t, { vol: s === 0 ? 0.8 : 0.62, f0: 120, f1: 48, decay: 0.42 });
      if (s === 4 || s === 12) K.snare(ctx, b, t, { vol: 0.28, decay: 0.2, freq: 1500, tone: 175 });
      if (s % 2 === 0) K.hat(ctx, b, t, { vol: 0.05 + 0.04 * hash(bar, s, 1), decay: 0.035 });
      if (s === 15 || (s === 11 && bar % 2)) K.hat(ctx, b, t, { vol: 0.035, decay: 0.03 });

      if (s === 0) K.voice(ctx, b, t, mtof(root), sd * 6, { type: 'triangle', vol: 0.34, a: 0.01, d: 0.5, s: 0.6, r: 0.12, cutoff: 600 });
      if (s === 10) K.voice(ctx, b, t, mtof(root + 7), sd * 3, { type: 'triangle', vol: 0.26, a: 0.01, d: 0.3, s: 0.5, r: 0.1, cutoff: 600 });

      if (s === 0 || s === 10) {
        const soft = s === 10 ? 0.6 : 1;
        const notes = s === 10 ? ch.slice(2) : ch;
        notes.forEach((n, i) => {
          const tt = t + i * 0.014;
          K.voice(ctx, b, tt, mtof(n), sd * (s === 0 ? 8 : 5), { type: 'sine', vol: 0.07 * soft, a: 0.006, d: 1.4, s: 0.3, r: 0.6, detune: [-5, 5] });
          K.voice(ctx, b, tt, mtof(n), sd * 2, { type: 'triangle', vol: 0.018 * soft, a: 0.004, d: 0.3, s: 0.1, r: 0.3, cutoff: 2400 });
        });
      }

      if (s % 2 === 0 && s !== 0 && hash(bar, s, 7) < 0.3) {
        const pent = [65, 67, 69, 72, 74, 77, 79, 81];
        const n = pent[Math.floor(hash(bar, s, 9) * pent.length)] + 12;
        const g = K.voice(ctx, b, t, mtof(n), sd * 1.5, { type: 'triangle', vol: 0.05, a: 0.004, d: 0.25, s: 0, r: 0.25, cutoff: 3200 });
        g.connect(st.send);
      }
    },
  };

  /* TAMA EXPRESSION — driving four-on-the-floor at dusk, offbeat bass, rising arp, rail-joint clicks. */
  SKETCHES.tama = {
    bpm: 124, swing: 0, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.3, fcut: 3200, wet: 0.45 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const roots = [45, 41, 48, 43];
      const chords = [[57, 60, 64, 69], [57, 60, 65, 69], [55, 60, 64, 67], [55, 59, 62, 67]];
      const root = roots[bar], ch = chords[bar];

      if (s % 4 === 0) K.kick(ctx, b, t, { vol: 0.82, f0: 150, f1: 50, decay: 0.3 });
      if (s === 4 || s === 12) K.clap(ctx, b, t, { vol: 0.24 });
      if (s % 4 === 2) K.hat(ctx, b, t, { vol: 0.1, decay: 0.06 });
      K.hat(ctx, b, t, { vol: 0.025 + 0.015 * (s % 2), decay: 0.02, freq: 9000 });
      if (s === 6 || s === 14) K.click(ctx, b, t, { freq: 1250, vol: 0.06, decay: 0.035 });
      if (s === 7 || s === 15) K.click(ctx, b, t, { freq: 940, vol: 0.05, decay: 0.04 });

      if (s === 0) K.voice(ctx, b, t, mtof(root - 12), sd * 2, { type: 'sine', vol: 0.3, a: 0.004, d: 0.3, s: 0.4, r: 0.08 });
      if (s % 4 === 2) K.voice(ctx, b, t, mtof(root - 12), sd * 1.6, { type: 'sawtooth', vol: 0.16, a: 0.004, d: 0.12, s: 0.4, r: 0.05, cutoff: 480, fenv: 3, fdec: 0.08 });

      const tones = [ch[0], ch[1], ch[2], ch[3], ch[0] + 12];
      const seq = [0, 1, 2, 3, 4, 3, 2, 1];
      const g = K.voice(ctx, b, t, mtof(tones[seq[s % 8]] + 12), sd * 0.9, { type: 'square', vol: 0.035, a: 0.003, d: 0.12, s: 0.2, r: 0.08, cutoff: 2200, fenv: 2 });
      g.connect(st.send);

      if (s === 0) ch.forEach((n) => K.voice(ctx, b, t, mtof(n), sd * 15, { type: 'sawtooth', vol: 0.026, a: 0.5, d: 1, s: 0.8, r: 0.6, cutoff: 1300, detune: [-8, 8] }));
    },
  };

  /* FLIP DA HOODS — half-time trap: gliding 808, hat rolls, phrygian bell, a riser into each 4-bar flip. */
  SKETCHES.flip = {
    bpm: 140, swing: 0, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.42, fcut: 2400, wet: 0.5 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const eights = [
        [[0, 38, 6], [7, 38, 2], [10, 41, 5]],
        [[0, 38, 5], [6, 38, 1], [8, 36, 2], [11, 39, 4]],
        [[0, 38, 6], [7, 38, 2], [10, 41, 5]],
        [[0, 34, 5], [6, 34, 2], [10, 36, 2], [12, 38, 4]],
      ];
      for (const [step, n, len] of eights[bar]) {
        if (step !== s) continue;
        K.voice(ctx, b, t, mtof(n), sd * len, { type: 'sine', vol: 0.5, a: 0.002, d: 0.5, s: 0.55, r: 0.12, drive: true, glide: { from: mtof(n + 5), time: 0.05 } });
        if (s === 0 || s === 10) K.kick(ctx, b, t, { vol: 0.6, f0: 170, f1: 45, decay: 0.2 });
      }
      if (s === 8) { K.clap(ctx, b, t, { vol: 0.3, freq: 1300 }); K.snare(ctx, b, t, { vol: 0.16, decay: 0.12, tone: 210 }); }

      if (s % 2 === 0) K.hat(ctx, b, t, { vol: 0.07, decay: 0.03 });
      if (bar % 2 === 1 && s >= 12) {
        for (let k = 0; k < 3; k++) K.hat(ctx, b, t + (k * sd) / 3, { vol: 0.03 + 0.012 * k, decay: 0.02 });
      }
      if (s === 14 && bar % 2 === 0) K.hat(ctx, b, t, { vol: 0.05, decay: 0.22 });

      const bells = [{ 0: 74, 3: 75, 6: 74, 10: 69 }, { 0: 74, 3: 75, 6: 77, 8: 75 }, { 0: 74, 3: 75, 6: 74, 10: 69 }, { 0: 70, 3: 69, 6: 67, 10: 69 }];
      const n = bells[bar][s];
      if (n) {
        const g1 = K.voice(ctx, b, t, mtof(n), sd * 2, { type: 'square', vol: 0.032, a: 0.002, d: 0.3, s: 0, r: 0.3, cutoff: 2600 });
        const g2 = K.voice(ctx, b, t, mtof(n + 12), sd * 2, { type: 'sine', vol: 0.02, a: 0.002, d: 0.4, s: 0, r: 0.4 });
        g1.connect(st.send);
        g2.connect(st.send);
      }
      if (s === 0) [50, 53, 57].forEach((m) => K.voice(ctx, b, t, mtof(m), sd * 15, { type: 'sawtooth', vol: 0.016, a: 0.6, d: 1, s: 0.8, r: 0.5, cutoff: 900, detune: [-10, 10] }));
      if (bar === 3 && s === 8) K.riser(ctx, b, t, sd * 8, { vol: 0.1 });
    },
  };

  /* STEREOTYPE — the same square-wave ostinato bar after bar (one note out of place), ticking machine percussion. */
  SKETCHES.stereotype = {
    bpm: 108, swing: 0, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.25, fcut: 4000, wet: 0.35 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      let iv = [0, 7, 12, 7][s % 4];
      if (bar === 3 && s === 14) iv = 15;
      if (bar === 3 && s === 15) iv = 14;
      K.voice(ctx, b, t, mtof(60 + iv), sd * 0.8, { type: 'square', vol: 0.04, a: 0.002, d: 0.08, s: 0.15, r: 0.04, cutoff: 3500 });

      if (s % 4 === 0) {
        const bn = bar === 3 ? (s < 8 ? 32 : 34) : 36;
        K.voice(ctx, b, t, mtof(bn), sd * 3, { type: 'square', vol: 0.09, a: 0.003, d: 0.2, s: 0.5, r: 0.04, cutoff: 600 });
      }
      K.hat(ctx, b, t, { vol: s % 4 === 0 ? 0.08 : 0.03, decay: 0.012, freq: 9000 });
      if (s === 0 || s === 8 || (bar % 2 === 1 && s === 11)) K.kick(ctx, b, t, { vol: 0.72, f0: 130, f1: 50, decay: 0.22 });
      if (s === 4 || s === 12) {
        K.click(ctx, b, t, { freq: 2600, vol: 0.1, decay: 0.03, type: 'square' });
        K.snare(ctx, b, t, { vol: 0.13, decay: 0.06, freq: 3000, tone: 0 });
      }
      if (bar === 0 && s === 0) {
        const g = K.voice(ctx, b, t, mtof(91), sd * 2, { type: 'sine', vol: 0.035, a: 0.002, d: 1.2, s: 0, r: 1 });
        g.connect(st.send);
      }
    },
  };

  /* NO JOBB (FLASH) — bright, fast breakbeat with supersaw stabs, octave bass, sparkles and a crash every other bar. */
  SKETCHES.flash = {
    bpm: 150, swing: 0, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.33, fcut: 5000, wet: 0.45 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const roots = [36, 33, 29, 31];
      const chords = [[60, 64, 67, 72], [57, 60, 64, 69], [57, 60, 65, 69], [55, 59, 62, 67]];
      const root = roots[bar], ch = chords[bar];

      if (s === 0 || s === 6 || s === 10 || (bar === 3 && s === 14)) K.kick(ctx, b, t, { vol: 0.8, f0: 165, f1: 48, decay: 0.26 });
      if (s === 4 || s === 12) K.snare(ctx, b, t, { vol: 0.32, decay: 0.15, tone: 220 });
      if (s === 14 && bar !== 3) K.snare(ctx, b, t, { vol: 0.08, decay: 0.08, tone: 0 });
      if (s % 2 === 0) K.hat(ctx, b, t, { vol: 0.055, decay: 0.03 });
      if (s === 2 || s === 10) K.hat(ctx, b, t, { vol: 0.04, decay: 0.18 });
      if (s === 0 && bar % 2 === 0) K.crash(ctx, b, t, { vol: 0.09 });

      if (s % 2 === 0) K.voice(ctx, b, t, mtof(root + (s % 4 === 2 ? 12 : 0)), sd * 1.5, { type: 'sawtooth', vol: 0.13, a: 0.003, d: 0.1, s: 0.4, r: 0.05, cutoff: 900, fenv: 2.5, fdec: 0.08 });

      if (s === 3 || s === 6 || s === 11 || s === 14) {
        for (const n of ch) {
          const g = K.voice(ctx, b, t, mtof(n), sd * 0.9, { type: 'sawtooth', vol: 0.02, a: 0.004, d: 0.15, s: 0.3, r: 0.08, cutoff: 4200, fenv: 1.6, fdec: 0.1, detune: [-12, 0, 12] });
          if (n === ch[3]) g.connect(st.send);
        }
      }
      if (hash(bar, s, 3) < 0.3) {
        const pent = [72, 74, 76, 79, 81, 84, 86, 88];
        const g = K.voice(ctx, b, t, mtof(pent[Math.floor(hash(bar, s, 5) * pent.length)] + 12), sd, { type: 'sine', vol: 0.028, a: 0.002, d: 0.2, s: 0, r: 0.2 });
        g.connect(st.send);
      }
    },
  };

  /* SHOT — fast night drive: 172 BPM breakbeat, rolling reese bass, stabs. */
  SKETCHES.shot = {
    bpm: 172, swing: 0, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.3, fcut: 3500, wet: 0.4 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const roots = [38, 38, 41, 36];
      const root = roots[bar];
      if (s === 0 || s === 10 || (bar % 2 === 1 && s === 7)) K.kick(ctx, b, t, { vol: 0.8, f0: 170, f1: 50, decay: 0.22 });
      if (s === 4 || s === 12) K.snare(ctx, b, t, { vol: 0.36, decay: 0.14, tone: 230 });
      if (s === 15 || (s === 9 && bar % 2 === 0)) K.snare(ctx, b, t, { vol: 0.1, decay: 0.06, tone: 0 });
      if (s % 2 === 0) K.hat(ctx, b, t, { vol: 0.06, decay: 0.025 });
      else K.hat(ctx, b, t, { vol: 0.025, decay: 0.015, freq: 9000 });
      if (s === 0 || s === 6 || s === 10) K.voice(ctx, b, t, SW.mtof(root - 12), sd * (s === 0 ? 5 : 3), { type: 'sawtooth', vol: 0.16, a: 0.003, d: 0.3, s: 0.6, r: 0.06, cutoff: 420, fenv: 2.2, fdec: 0.2, detune: [-14, 14], drive: true });
      if (s === 2 || s === 11) {
        for (const iv of [0, 3, 7, 10]) { const g = K.voice(ctx, b, t, SW.mtof(root + 24 + iv), sd * 0.8, { type: 'square', vol: 0.018, a: 0.002, d: 0.1, s: 0.2, r: 0.06, cutoff: 3000 }); g.connect(st.send); }
      }
      if (bar === 3 && s === 8) K.riser(ctx, b, t, sd * 8, { vol: 0.08 });
    },
  };

  /* OHH — wide, sunlit house: 124 BPM, open chords, plucked arp, bright hats. */
  SKETCHES.ohh = {
    bpm: 124, swing: 0.06, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, { fb: 0.42, fcut: 4200, wet: 0.55 }); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const chords = [[62, 66, 69, 73, 76], [59, 62, 66, 69, 73], [55, 59, 62, 66, 71], [57, 61, 64, 69, 73]];
      const roots = [38, 35, 43, 45];
      const ch = chords[bar];
      if (s % 4 === 0) K.kick(ctx, b, t, { vol: 0.75, f0: 140, f1: 48, decay: 0.3 });
      if (s === 4 || s === 12) K.clap(ctx, b, t, { vol: 0.22 });
      if (s % 4 === 2) K.hat(ctx, b, t, { vol: 0.09, decay: 0.12 });
      if (s % 2 === 1) K.hat(ctx, b, t, { vol: 0.03, decay: 0.02 });
      if (s % 4 === 2 || s === 15) K.voice(ctx, b, t, SW.mtof(roots[bar]), sd * 1.5, { type: 'triangle', vol: 0.3, a: 0.004, d: 0.2, s: 0.5, r: 0.06, cutoff: 700 });
      if (s === 0 || s === 7 || s === 10) ch.forEach((n) => K.voice(ctx, b, t, SW.mtof(n), sd * (s === 0 ? 6 : 2.5), { type: 'sawtooth', vol: 0.022, a: 0.01, d: 0.6, s: 0.5, r: 0.4, cutoff: 2600, fenv: 1.5, fdec: 0.3, detune: [-9, 9] }));
      const seq = [0, 2, 4, 1, 3, 4, 2, 1];
      const g = K.voice(ctx, b, t, SW.mtof(ch[seq[s % 8]] + 12), sd * 0.9, { type: 'triangle', vol: 0.03, a: 0.002, d: 0.15, s: 0, r: 0.15, cutoff: 5000 });
      g.connect(st.send);
    },
  };

  /* Fallback for songs whose sketch name is unknown: a gentle pulse in A minor. */
  SKETCHES.default = {
    bpm: 100, swing: 0.1, bars: 4,
    setup(ctx, out) { return baseSetup(ctx, out, this.bpm, {}); },
    step(ctx, st, t, s, bar, sd) {
      const K = Kit, b = st.bus;
      const roots = [45, 41, 43, 40];
      if (s % 4 === 0) K.kick(ctx, b, t, { vol: 0.7 });
      if (s === 4 || s === 12) K.snare(ctx, b, t, { vol: 0.25 });
      if (s % 2 === 0) K.hat(ctx, b, t, { vol: 0.05 });
      if (s === 0) [0, 3, 7, 10].forEach((iv) => K.voice(ctx, b, t, mtof(roots[bar] + 12 + iv), sd * 14, { type: 'triangle', vol: 0.05, a: 0.2, d: 1, s: 0.6, r: 0.5 }));
      if (s % 4 === 2) K.voice(ctx, b, t, mtof(roots[bar] - 12), sd * 2, { type: 'sine', vol: 0.3, d: 0.3, s: 0.3 });
    },
  };

  SW.Kit = Kit;
  SW.SKETCHES = SKETCHES;
  SW.mtof = mtof;
})();
