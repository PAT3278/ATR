// Gapless playback engine for the player page's low-latency mode (served by
// the plugin as /player-worklet.js).
//
// PtStreamCore plays decoded 48 kHz stereo chunks from a ring buffer as one
// continuous stream, resampling to the phone's own output rate with a single
// stateful interpolator. (Scheduling each chunk as its own
// AudioBufferSourceNode instead leaves overlaps/gaps of a sample at every
// join whenever the phone isn't running at 48 kHz -- audible clicks.)
//
// It also owns the jitter buffer: playback starts once `target` seconds are
// buffered, an underrun rebuffers with a slightly bigger cushion, and slow
// clock drift between computer and phone is absorbed by nudging the
// playback rate by at most +-0.2 % (inaudible) instead of skipping.
//
// The same core runs in two hosts:
//  * an AudioWorklet (below), where the browser allows one -- only in
//    secure contexts (HTTPS or localhost);
//  * a ScriptProcessorNode on the page itself otherwise, which is what a
//    phone opening the plugin's plain-HTTP LAN address gets. The page loads
//    this file as a normal script for that.

const STREAM_RATE = 48000;

class PtStreamCore {
  constructor(outputRate) {
    this.outputRate = outputRate;
    this.cap = STREAM_RATE * 4;
    this.bufL = new Float32Array(this.cap);
    this.bufR = new Float32Array(this.cap);
    this.written = 0;        // frames written, monotonic
    this.readPos = 0;        // fractional read position, monotonic
    this.minTarget = 0.08 * STREAM_RATE;
    this.maxTarget = 0.5 * STREAM_RATE;
    this.target = 0.12 * STREAM_RATE;
    this.playing = false;    // false while (re)buffering
    this.baseRatio = STREAM_RATE / outputRate;
    this.fillAvg = this.target;
    this.stableFrames = 0;
    this.underruns = 0;
    this.dropped = 0;
    this.rendered = 0;
    this.lastReport = 0;
  }

  push(l, r) {
    for (let i = 0; i < l.length; i++) {
      const idx = (this.written + i) % this.cap;
      this.bufL[idx] = l[i];
      this.bufR[idx] = r[i];
    }
    this.written += l.length;

    if (this.written - this.readPos > this.cap - 4096) {
      this.readPos = this.written - this.target; // about to be overwritten: jump forward
      this.dropped++;
    }
  }

  // 4-point cubic Hermite at a fractional position.
  sample(buf, pos) {
    const cap = this.cap, i = Math.floor(pos), t = pos - i;
    const xm1 = buf[(i - 1 + cap) % cap], x0 = buf[i % cap], x1 = buf[(i + 1) % cap], x2 = buf[(i + 2) % cap];
    const c1 = 0.5 * (x1 - xm1);
    const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
    const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    return ((c3 * t + c2) * t + c1) * t + x0;
  }

  render(L, R) {
    const n = L.length;
    this.rendered += n;
    let fill = this.written - this.readPos;

    if (!this.playing) {
      if (fill < this.target) {
        L.fill(0); R.fill(0);
        return;
      }
      this.playing = true;
      this.readPos = this.written - this.target;
      this.fillAvg = fill = this.target;
    }

    // Arrived in a burst far behind real time (e.g. after a Wi-Fi stall):
    // skip back to the target delay rather than staying late.
    if (fill > this.target + 0.35 * STREAM_RATE) {
      this.readPos = this.written - this.target;
      this.fillAvg = fill = this.target;
      this.dropped++;
    }

    // Drift control: run up to 0.2 % fast/slow while the (smoothed) buffer
    // is above/below target.
    this.fillAvg += (fill - this.fillAvg) * 0.01;
    const error = (this.fillAvg - this.target) / this.target;
    const ratio = this.baseRatio * (1 + Math.max(-0.002, Math.min(0.002, error * 0.004)));

    if (fill < n * ratio + 3) {
      // Underrun: go silent and rebuffer with a slightly bigger cushion.
      L.fill(0); R.fill(0);
      this.playing = false;
      this.underruns++;
      this.target = Math.min(this.maxTarget, this.target + 0.03 * STREAM_RATE);
      this.stableFrames = 0;
      return;
    }

    for (let i = 0; i < n; i++) {
      L[i] = this.sample(this.bufL, this.readPos);
      R[i] = this.sample(this.bufR, this.readPos);
      this.readPos += ratio;
    }

    // Stable for a while: creep back towards the lowest latency.
    this.stableFrames += n;
    if (this.stableFrames > 15 * this.outputRate && this.target > this.minTarget) {
      this.target = Math.max(this.minTarget, this.target - 0.01 * STREAM_RATE);
      this.stableFrames = 0;
    }
  }

  /** Buffer state, about 8 times a second (null in between). */
  report() {
    if (this.rendered - this.lastReport < this.outputRate / 8)
      return null;
    this.lastReport = this.rendered;
    return { fill: (this.written - this.readPos) / STREAM_RATE, underruns: this.underruns, dropped: this.dropped };
  }
}

if (typeof AudioWorkletProcessor !== "undefined") {
  class PtStreamProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.core = new PtStreamCore(sampleRate);
      this.port.onmessage = e => this.core.push(e.data.l, e.data.r);
    }

    process(inputs, outputs) {
      const out = outputs[0];
      this.core.render(out[0], out[1] || out[0]);
      const r = this.core.report();
      if (r) this.port.postMessage(r);
      return true;
    }
  }

  registerProcessor("pt-stream", PtStreamProcessor);
}
