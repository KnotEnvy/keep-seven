// Measurements on rendered buffers (tests, the sandbox scope, shots/code-audio spectrograms). Pure functions, no DOM:
// test-only code, so it allocates freely.

export interface SoundStats {
  peak: number;
  rms: number;
  /** seconds from the first to the last sample above -60 dB of the peak */
  duration: number;
  centroidHz: number;
  fundamentalHz: number;
  /** index of the first sample that is not silent (|x| > 1e-6), -1 when all silent */
  firstSample: number;
  sampleRate: number;
  seconds: number;
}

function clampRange(n: number, sr: number, t0: number, t1: number): [number, number] {
  const a = Math.max(0, Math.min(n, Math.round(t0 * sr)));
  const b = Math.max(a, Math.min(n, t1 < 0 ? n : Math.round(t1 * sr)));
  return [a, b];
}

export function peakOf(x: Float32Array, sr: number, t0 = 0, t1 = -1): number {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  let p = 0;
  for (let i = a; i < b; i++) { const v = Math.abs(x[i] as number); if (v > p) p = v; }
  return p;
}
export function rmsOf(x: Float32Array, sr: number, t0 = 0, t1 = -1): number {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) { const v = x[i] as number; s += v * v; }
  return Math.sqrt(s / (b - a));
}
export function toDb(v: number): number { return v <= 1e-12 ? -240 : 20 * Math.log10(v); }

/** In-place radix-2 FFT. `re` and `im` have a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i] as number; re[i] = re[j] as number; re[j] = tr; const ti = im[i] as number; im[i] = im[j] as number; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci, xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr; im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr; im[a] = (im[a] as number) + xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface Spectrum { power: Float64Array; binHz: number }
/** Power spectrum of a Hann-windowed span, zero-padded to at least `minSize` (a power of two). */
export function spectrum(x: Float32Array, sr: number, t0 = 0, t1 = -1, minSize = 4096): Spectrum {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  const len = b - a;
  let n = 2;
  while (n < len * 2 || n < minSize) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = (x[a + i] as number) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / len));
  fft(re, im);
  const power = new Float64Array(n >> 1);
  for (let i = 0; i < power.length; i++) power[i] = (re[i] as number) * (re[i] as number) + (im[i] as number) * (im[i] as number);
  return { power, binHz: sr / n };
}

/** Spectral centroid in Hz over [fLo, fHi]. */
export function centroidOf(x: Float32Array, sr: number, t0 = 0, t1 = -1, fLo = 20, fHi = 20000): number {
  const s = spectrum(x, sr, t0, t1);
  let num = 0, den = 0;
  const k0 = Math.max(1, Math.floor(fLo / s.binHz)), k1 = Math.min(s.power.length - 1, Math.ceil(fHi / s.binHz));
  for (let k = k0; k <= k1; k++) { const p = s.power[k] as number; num += p * k * s.binHz; den += p; }
  return den > 0 ? num / den : 0;
}

/** Share of the span's energy between two frequencies (0..1). */
export function bandShare(x: Float32Array, sr: number, t0: number, t1: number, fLo: number, fHi: number): number {
  const s = spectrum(x, sr, t0, t1, 1024);
  let band = 0, all = 0;
  for (let k = 1; k < s.power.length; k++) {
    const p = s.power[k] as number, f = k * s.binHz;
    all += p;
    if (f >= fLo && f <= fHi) band += p;
  }
  return all > 0 ? band / all : 0;
}

/**
 * The strongest partial between fLo and fHi, refined to a fraction of a bin: the power-weighted mean frequency around
 * the peak (a beating pair of close partials reads as its centre).
 */
export function partialNear(x: Float32Array, sr: number, t0: number, t1: number, fLo: number, fHi: number): number {
  const s = spectrum(x, sr, t0, t1, 1 << 16);
  const k0 = Math.max(1, Math.floor(fLo / s.binHz)), k1 = Math.min(s.power.length - 2, Math.ceil(fHi / s.binHz));
  let best = k0, bestP = -1;
  for (let k = k0; k <= k1; k++) { const p = s.power[k] as number; if (p > bestP) { bestP = p; best = k; } }
  if (bestP <= 0) return 0;
  // everything within 26 cents of the peak and within 30 dB of it: a beating pair is weighed as one partial
  const lo = Math.max(1, Math.floor(best * 0.985)), hi = Math.min(s.power.length - 1, Math.ceil(best * 1.015));
  let num = 0, den = 0;
  for (let k = lo; k <= hi; k++) { const p = s.power[k] as number; if (p >= bestP * 1e-3) { num += p * k; den += p; } }
  return (num / den) * s.binHz;
}

/** The lowest strong partial (within 20 dB of the strongest) between 30 Hz and 5 kHz: the pitch of a simple sound. */
export function fundamentalOf(x: Float32Array, sr: number, t0 = 0, t1 = -1, fLo = 30, fHi = 5000): number {
  const s = spectrum(x, sr, t0, t1, 1 << 15);
  const k0 = Math.max(1, Math.floor(fLo / s.binHz)), k1 = Math.min(s.power.length - 2, Math.ceil(fHi / s.binHz));
  let max = 0;
  for (let k = k0; k <= k1; k++) if ((s.power[k] as number) > max) max = s.power[k] as number;
  if (max <= 0) return 0;
  for (let k = k0 + 1; k < k1; k++) {
    const p = s.power[k] as number;
    if (p >= max * 0.01 && p >= (s.power[k - 1] as number) && p >= (s.power[k + 1] as number)) {
      const f = k * s.binHz;
      return partialNear(x, sr, t0, t1, f * 0.94, f * 1.06);
    }
  }
  return 0;
}

/** Frequency from upward zero crossings in a span (a clean swept sine: the boom). */
export function zeroCrossHz(x: Float32Array, sr: number, t0: number, t1: number): number {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  let first = -1, last = -1, count = 0;
  for (let i = a + 1; i < b; i++) {
    const p = x[i - 1] as number, c = x[i] as number;
    if (p <= 0 && c > 0) {
      const at = i - 1 + (0 - p) / (c - p);
      if (first < 0) first = at; else count++;
      last = at;
    }
  }
  return count > 0 ? count * sr / (last - first) : 0;
}

/** RMS in consecutive windows (seconds). */
export function envelope(x: Float32Array, sr: number, windowSeconds: number): Float32Array {
  const w = Math.max(1, Math.round(windowSeconds * sr));
  const n = Math.floor(x.length / w);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = k * w; i < (k + 1) * w; i++) { const v = x[i] as number; s += v * v; }
    out[k] = Math.sqrt(s / w);
  }
  return out;
}

/** Seconds from the first to the last sample within `db` of the peak. */
export function durationOf(x: Float32Array, sr: number, db = -60): number {
  const p = peakOf(x, sr);
  if (p <= 0) return 0;
  const thr = p * Math.pow(10, db / 20);
  let a = -1, b = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] as number) >= thr) { if (a < 0) a = i; b = i; }
  return a < 0 ? 0 : (b - a + 1) / sr;
}

/** The time at which the last sample at or above an absolute level (dB full scale) ends; -1 when none. */
export function lastAbove(x: Float32Array, sr: number, db: number, t0 = 0, t1 = -1): number {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  const thr = Math.pow(10, db / 20);
  for (let i = b - 1; i >= a; i--) if (Math.abs(x[i] as number) >= thr) return (i + 1) / sr;
  return -1;
}
/** The time of the first sample at or above an absolute level; -1 when none. */
export function firstAbove(x: Float32Array, sr: number, db: number, t0 = 0, t1 = -1): number {
  const [a, b] = clampRange(x.length, sr, t0, t1);
  const thr = Math.pow(10, db / 20);
  for (let i = a; i < b; i++) if (Math.abs(x[i] as number) >= thr) return i / sr;
  return -1;
}

/**
 * The tail of an impulse response: seconds until its level (RMS in 20 ms windows) has fallen 60 dB below where it
 * started (the loudest of its first three windows) for good.
 */
export function tail60(x: Float32Array, sr: number): number {
  const w = 0.02, env = envelope(x, sr, w);
  let ref = 0;
  for (let i = 0; i < 3 && i < env.length; i++) if ((env[i] as number) > ref) ref = env[i] as number;
  if (ref <= 0) return 0;
  const thr = ref * 1e-3;
  for (let i = env.length - 1; i >= 0; i--) if ((env[i] as number) >= thr) return (i + 1) * w;
  return 0;
}

/**
 * Reverberation time by Schroeder's backward integration: the time the decay curve takes from -5 to -35 dB, doubled
 * (T30). A discrete echo (the outdoor slap) bends this curve; tail60() is the measure the zones are held to.
 */
export function schroeder30(x: Float32Array, sr: number): number {
  const n = x.length;
  const edc = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) edc[i] = (edc[i + 1] as number) + (x[i] as number) * (x[i] as number);
  const total = edc[0] as number;
  if (total <= 0) return 0;
  let t5 = -1, t35 = -1;
  for (let i = 0; i < n; i++) {
    const db = 10 * Math.log10((edc[i] as number) / total + 1e-30);
    if (t5 < 0 && db <= -5) t5 = i;
    if (db <= -35) { t35 = i; break; }
  }
  if (t5 < 0 || t35 < 0) return 0;
  return 2 * (t35 - t5) / sr;
}

export function statsOf(x: Float32Array, sr: number): SoundStats {
  let first = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] as number) > 1e-6) { first = i; break; }
  const peak = peakOf(x, sr);
  return {
    peak, rms: rmsOf(x, sr), duration: durationOf(x, sr), firstSample: first, sampleRate: sr, seconds: x.length / sr,
    centroidHz: peak > 0 ? centroidOf(x, sr) : 0, fundamentalHz: peak > 0 ? fundamentalOf(x, sr) : 0,
  };
}

/**
 * dB magnitudes on a (time, log-frequency) grid, one byte per cell (0 = floorDb or less, 255 = 0 dB re the loudest
 * cell), row 0 = the highest frequency. For shots/code-audio.
 */
export function spectrogram(x: Float32Array, sr: number, width: number, height: number, fLo = 40, fHi = 16000, floorDb = -80): Uint8Array {
  const size = 2048, hop = Math.max(1, Math.floor((x.length - size) / Math.max(1, width - 1)));
  const re = new Float64Array(size), im = new Float64Array(size);
  const mags = new Float32Array(width * height);
  let max = 1e-12;
  for (let c = 0; c < width; c++) {
    const a = Math.min(Math.max(0, x.length - size), c * hop);
    for (let i = 0; i < size; i++) { re[i] = ((x[a + i] as number | undefined) ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)); im[i] = 0; }
    fft(re, im);
    for (let r = 0; r < height; r++) {
      const f0 = fLo * Math.pow(fHi / fLo, (height - 1 - r) / height), f1 = fLo * Math.pow(fHi / fLo, (height - r) / height);
      const k0 = Math.max(1, Math.floor(f0 * size / sr)), k1 = Math.max(k0, Math.min(size / 2 - 1, Math.floor(f1 * size / sr)));
      let p = 0;
      for (let k = k0; k <= k1; k++) { const m = (re[k] as number) * (re[k] as number) + (im[k] as number) * (im[k] as number); if (m > p) p = m; }
      mags[r * width + c] = p;
      if (p > max) max = p;
    }
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const db = 10 * Math.log10((mags[i] as number) / max + 1e-20);
    out[i] = Math.max(0, Math.min(255, Math.round(255 * (1 - db / floorDb))));
  }
  return out;
}
