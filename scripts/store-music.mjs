// An original score for the promo reel, synthesized in code: no samples, no
// licensed material. 160 BPM in A minor, with hits placed on the reel's cues.
import { writeFileSync } from "node:fs";

export const SR = 48000;
export const BEAT = 0.375; // 160 BPM
export const DROP = 2.6; // first flag frame; the beat grid is anchored here
export const beat = (n) => DROP + n * BEAT;

export function renderMusic(path, duration = 15) {
  const N = Math.round(SR * duration);
  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const drums = bus(), music = bus(), fx = bus(), send = bus();

  let seed = 1234567;
  const noise = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2147483648 - 1; };
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  const put = (b, i, l, r = l) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
  const at = (t) => Math.round(t * SR);
  // Topology-preserving state-variable filter (Simper). Returns the chosen output.
  const svf = (mode) => {
    let ic1 = 0, ic2 = 0;
    return (x, fc, q = 0.707) => {
      const g = Math.tan(Math.PI * Math.min(Math.max(fc, 20), SR * 0.45) / SR);
      const k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      return mode === "low" ? v2 : mode === "band" ? v1 : x - k * v1 - v2;
    };
  };
  const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;
  const kicks = [];

  // ---------- instruments ----------
  function kick(t0, g = 1) {
    kicks.push(t0);
    let ph = 0;
    for (let i = 0; i < 0.5 * SR; i += 1) {
      const t = i / SR;
      ph += (2 * Math.PI * (42 + 125 * Math.exp(-t * 30))) / SR;
      const amp = Math.exp(-t * 6.5) * Math.min(1, t / 0.003);
      const click = t < 0.006 ? noise() * 0.4 * (1 - t / 0.006) : 0;
      put(drums, at(t0) + i, (Math.sin(ph) * amp + click) * g);
    }
  }
  function clap(t0, g = 0.5) {
    const f = svf("band");
    for (let i = 0; i < 0.35 * SR; i += 1) {
      const t = i / SR;
      const bursts = [0, 0.009, 0.018].reduce((s, b) => s + (t >= b ? Math.exp(-(t - b) * (b === 0.018 ? 13 : 180)) : 0), 0);
      const v = f(noise(), 1500, 0.9) * bursts * g * 1.6;
      put(drums, at(t0) + i, v * 0.95, v);
      put(send, at(t0) + i, v * 0.25);
    }
  }
  function snare(t0, g = 0.3) {
    const f = svf("band");
    let ph = 0;
    for (let i = 0; i < 0.18 * SR; i += 1) {
      const t = i / SR;
      ph += (2 * Math.PI * 185) / SR;
      const v = (f(noise(), 2200, 0.7) * 1.4 + Math.sin(ph) * 0.4) * Math.exp(-t * 22) * g;
      put(drums, at(t0) + i, v);
      put(send, at(t0) + i, v * 0.2);
    }
  }
  function hat(t0, g = 0.1, open = false) {
    const f = svf("high");
    for (let i = 0; i < (open ? 0.35 : 0.06) * SR; i += 1) {
      const t = i / SR;
      const v = f(noise(), 8500, 0.8) * Math.exp(-t * (open ? 11 : 75)) * g;
      put(drums, at(t0) + i, v * 0.8, v);
    }
  }
  function bassNote(t0, dur, midi, g = 0.3, dark = 1) {
    const f = svf("low");
    const hz = mtof(midi);
    let p1 = 0, p2 = 0;
    const len = dur + 0.03;
    for (let i = 0; i < len * SR; i += 1) {
      const t = i / SR;
      p1 += (hz * 1.003) / SR; p2 += (hz * 0.997) / SR;
      const env = Math.min(1, t / 0.003) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.03) : 1);
      const v = f((saw(p1) + saw(p2)) * 0.5, (160 + 1500 * Math.exp(-t * 9)) * dark, 1.1) * env * g;
      put(music, at(t0) + i, v);
    }
  }
  function pad(t0, dur, notes, g = 0.1, bright = 1500) {
    const release = 0.9, attack = 0.35;
    notes.forEach((midi, n) => {
      const hz = mtof(midi);
      const fl = svf("low"), fr = svf("low");
      const detune = [-0.006, 0, 0.006];
      const ph = [0, 0.33, 0.66], pr = [0.5, 0.1, 0.8];
      for (let i = 0; i < (dur + release) * SR; i += 1) {
        const t = i / SR;
        const env = Math.min(1, t / attack) * (t > dur ? Math.max(0, 1 - (t - dur) / release) : 1);
        let l = 0, r = 0;
        for (let d = 0; d < 3; d += 1) {
          ph[d] += (hz * (1 + detune[d])) / SR; pr[d] += (hz * (1 - detune[d] * 1.3)) / SR;
          l += saw(ph[d]); r += saw(pr[d]);
        }
        const vl = fl(l / 3, bright) * env * g, vr = fr(r / 3, bright) * env * g;
        put(music, at(t0) + i, vl, vr);
        put(send, at(t0) + i, vl * 0.35, vr * 0.35);
      }
    });
  }
  function pluck(t0, midi, g = 0.14, pan = 0) {
    const f = svf("low");
    const hz = mtof(midi);
    let p = 0;
    for (let i = 0; i < 0.5 * SR; i += 1) {
      const t = i / SR;
      p += hz / SR;
      const v = f(saw(p), 350 + 5200 * Math.exp(-t * 16), 1.2) * Math.exp(-t * 7) * Math.min(1, t / 0.002) * g;
      put(music, at(t0) + i, v * (1 - pan), v * (1 + pan));
      put(send, at(t0) + i, v * 0.45);
    }
  }
  function stab(t0, notes, g = 0.3) {
    notes.forEach((midi, n) => {
      const hz = mtof(midi);
      const f = svf("low");
      let p1 = 0, p2 = n * 0.2;
      for (let i = 0; i < 0.9 * SR; i += 1) {
        const t = i / SR;
        p1 += (hz * 1.004) / SR; p2 += (hz * 0.996) / SR;
        const v = f((saw(p1) + saw(p2)) * 0.5, 300 + 4200 * Math.exp(-t * 5), 0.9) * Math.exp(-t * 4.5) * Math.min(1, t / 0.002) * g / notes.length * 2;
        put(music, at(t0) + i, v * (n % 2 ? 0.8 : 1), v * (n % 2 ? 1 : 0.8));
        put(send, at(t0) + i, v * 0.6);
      }
    });
  }
  function boom(t0, g = 0.8, len = 1.4, f0 = 70, f1 = 30) {
    let ph = 0;
    for (let i = 0; i < len * SR; i += 1) {
      const t = i / SR;
      ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 3))) / SR;
      put(fx, at(t0) + i, Math.sin(ph) * Math.exp(-t * (3.2 / len)) * Math.min(1, t / 0.004) * g);
    }
  }
  function crash(t0, g = 0.3, len = 2) {
    const fl = svf("high"), fr = svf("high");
    for (let i = 0; i < len * SR; i += 1) {
      const t = i / SR;
      const env = Math.exp(-t * (4 / len)) * g;
      const l = fl(noise(), 5500) * env, r = fr(noise(), 5500) * env;
      put(fx, at(t0) + i, l, r);
      put(send, at(t0) + i, l * 0.5, r * 0.5);
    }
  }
  function riser(t0, t1, g = 0.35) {
    const f = svf("band"), tone = svf("low");
    let p = 0;
    for (let i = 0; i < (t1 - t0) * SR; i += 1) {
      const t = i / SR, u = t / (t1 - t0);
      const fc = 300 * Math.pow(30, u);
      p += mtof(45 + 30 * u) / SR;
      const env = Math.pow(u, 2.4) * g;
      const v = (f(noise(), fc, 1.4) * 1.6 + tone(saw(p), 800 + 4000 * u) * 0.35) * env;
      put(fx, at(t0) + i, v * (1 - 0.3 * Math.sin(u * 20)), v * (1 + 0.3 * Math.sin(u * 20)));
      put(send, at(t0) + i, v * 0.3);
    }
  }
  function sweep(t0, dur, from, to, g = 0.4, shape = (u) => Math.sin(Math.PI * u)) {
    const f = svf("band");
    for (let i = 0; i < dur * SR; i += 1) {
      const u = i / (dur * SR);
      const v = f(noise(), from * Math.pow(to / from, u), 1.1) * shape(u) * g * 1.8;
      put(fx, at(t0) + i, v * (1 - u * 0.6), v * (0.4 + u * 0.6));
      put(send, at(t0) + i, v * 0.3);
    }
  }
  function blip(t0, hz, g = 0.05) {
    for (let i = 0; i < 0.08 * SR; i += 1) {
      const t = i / SR;
      const v = Math.sin(2 * Math.PI * hz * t) * Math.exp(-t * 45) * g;
      put(music, at(t0) + i, v);
      put(send, at(t0) + i, v * 0.6);
    }
  }

  // ---------- arrangement ----------
  const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62] };
  const ROOT = { Am: 45, F: 41, C: 48, G: 43 };
  const up = (notes, o = 12) => notes.map((n) => n + o);

  // Intro: the whip, a muffled pulse, and a build into the drop.
  sweep(0, 0.9, 7000, 350, 0.55);
  boom(0.02, 0.5, 1.1, 60, 34);
  pad(0, 2.6, CH.Am, 0.1, 650);
  for (let n = -6; n < 0; n += 0.5) bassNote(beat(n), BEAT / 2 - 0.02, ROOT.Am, 0.22, 0.45 + 0.1 * (n + 6));
  riser(1.3, DROP, 0.4);
  for (let n = -2; n < 0; n += 0.25) snare(beat(n), 0.06 + 0.24 * ((n + 2) / 2));

  // Drop: four flags, four hits.
  const dropChords = [["Am", 0, 4], ["F", 4, 8], ["C", 8, 8.67]];
  for (const [name, from, to] of dropChords) {
    pad(beat(from), (to - from) * BEAT, CH[name], 0.09, 1800);
    for (let n = from; n < to - 0.01; n += 0.5) bassNote(beat(n), BEAT / 2 - 0.02, ROOT[name], 0.3);
  }
  for (let n = 0; n < 8.67; n += 0.5) {
    if (n % 2 === 0) kick(beat(n), 1);
    if (n === 3.5 || n === 7.5) kick(beat(n), 0.7);
    if (n % 2 === 1) clap(beat(n), 0.5);
    hat(beat(n), n % 1 === 0.5 ? 0.13 : 0.08, n % 2 === 1.5);
  }
  [0, 2, 4, 6].forEach((n, i) => {
    const chord = n < 4 ? CH.Am : CH.F;
    stab(beat(n), up(chord, 12), 0.34);
    boom(beat(n), 0.55, 0.9, 80, 38);
    crash(beat(n), i === 0 ? 0.3 : 0.14, i === 0 ? 2.2 : 0.9);
  });

  // Break: the morph. Drums out, tension, build.
  const IMPACT = beat(14); // 7.85: the icon lands
  sweep(5.85, 0.9, 4200, 220, 0.3, (u) => (1 - u) ** 2);
  pad(5.85, IMPACT - 5.85, CH.G, 0.13, 1400);
  bassNote(6.35, IMPACT - 6.4, ROOT.G - 12, 0.22, 0.5);
  riser(6.2, IMPACT, 0.5);
  for (let n = 12; n < 14; n += 0.25) snare(beat(n), 0.05 + 0.22 * ((n - 12) / 2));
  for (let n = 13.5; n < 14; n += 0.125) snare(beat(n), 0.18);

  // Impact: the icon.
  kick(IMPACT, 1.2);
  boom(IMPACT, 1.0, 2.4, 78, 27);
  stab(IMPACT, [...up(CH.Am, 12), 76], 0.5);
  crash(IMPACT, 0.45, 3.2);

  // Wordmark groove: arpeggio, bass, soft drums, and a blip per letter.
  const groove = [["Am", 14, 18], ["F", 18, 22], ["C", 22, 24]];
  for (const [name, from, to] of groove) {
    pad(beat(from), (to - from) * BEAT, CH[name], 0.075, 1600);
    for (let n = from; n < to - 0.01; n += 1) bassNote(beat(n), BEAT - 0.03, ROOT[name], 0.26);
    const tones = [...up(CH[name], 12), ...up(CH[name], 24)];
    for (let n = from, j = 0; n < to - 0.01; n += 0.5, j += 1) {
      const pattern = [0, 1, 2, 3, 4, 5, 4, 2];
      pluck(beat(n), tones[pattern[j % pattern.length]], 0.12, j % 2 ? 0.25 : -0.25);
    }
  }
  for (let n = 14; n < 24; n += 0.5) {
    if (n > 14 && n % 2 === 0) kick(beat(n), 0.75);
    if (n % 2 === 1) clap(beat(n), 0.3);
    if (n >= 16) hat(beat(n), n % 1 ? 0.09 : 0.05);
  }
  [..."ScrollGuard"].forEach((_, i) => blip(beat(17) + (i + (i >= 6 ? 1 : 0)) * 0.035, 1900 + i * 140, 0.045));

  // Proof chips: three rising hits, then the final chord.
  [CH.Am, [60, 64, 67], [64, 67, 71]].forEach((chord, i) => {
    const t = beat(24 + i);
    kick(t, 0.9);
    stab(t, up(chord, 12), 0.36);
    boom(t, 0.4, 0.6, 90, 45);
  });
  for (let n = 24; n < 28; n += 0.5) hat(beat(n), n % 1 ? 0.1 : 0.06, n === 27.5);
  pad(beat(24), 4 * BEAT, CH.C, 0.07, 1700);
  const FINAL = beat(28); // 13.1
  kick(FINAL, 1.1);
  boom(FINAL, 0.9, 2.0, 75, 30);
  stab(FINAL, [...up(CH.Am, 12), 83], 0.45);
  crash(FINAL, 0.4, 2.2);
  pad(FINAL, duration - FINAL - 0.4, [57, 60, 64, 71], 0.12, 2200);

  // ---------- mix ----------
  // Sidechain: the music ducks under every kick.
  const duck = new Float32Array(N).fill(1);
  for (const t0 of kicks) {
    for (let i = 0; i < 0.3 * SR; i += 1) {
      const k = at(t0) + i;
      if (k < N) duck[k] = Math.min(duck[k], 1 - 0.55 * Math.exp(-(i / SR) * 11));
    }
  }
  // Schroeder reverb on the send bus.
  const reverb = (input, offset) => {
    const out = new Float32Array(N);
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(Math.round((d + offset) * 1.09)), i: 0, lp: 0 }));
    const passes = [556, 441, 341].map((d) => ({ buf: new Float32Array(Math.round((d + offset) * 1.09)), i: 0 }));
    for (let n = 0; n < N; n += 1) {
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.lp = y * 0.72 + c.lp * 0.28;
        c.buf[c.i] = input[n] * 0.12 + c.lp * 0.86;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      for (const a of passes) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s * 0.5;
      }
      out[n] = s;
    }
    return out;
  };
  const wetL = reverb(send[0], 0), wetR = reverb(send[1], 23);
  const mix = [new Float32Array(N), new Float32Array(N)];
  // A 30 Hz high-pass removes sub-sonic energy no speaker can play.
  const rumble = [svf("high"), svf("high")];
  let peak = 0;
  for (let n = 0; n < N; n += 1) {
    const t = n / SR;
    const fade = t > duration - 0.6 ? Math.max(0, (duration - t) / 0.6) : 1;
    for (let c = 0; c < 2; c += 1) {
      const x = drums[c][n] * 0.9 + music[c][n] * 0.85 * duck[n] + fx[c][n] * 0.8 + (c ? wetR[n] : wetL[n]) * 0.9;
      const y = Math.tanh(rumble[c](x, 30) * 1.25) * fade; // gentle saturation as a limiter
      mix[c][n] = y;
      peak = Math.max(peak, Math.abs(y));
    }
  }
  // 16-bit stereo WAV, peak-normalized.
  const scale = 0.79 / peak; // about -2 dBFS leaves room for AAC encoding
  const data = Buffer.alloc(N * 4);
  for (let n = 0; n < N; n += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[0][n] * scale)) * 32767), n * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[1][n] * scale)) * 32767), n * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || "store/score.wav";
  renderMusic(out);
  console.log(`Score written to ${out}.`);
}
