// The squint test of ART_BIBLE 2.3 / 12.1: `node tests/art_env_interior/value.mjs a.png [b.png ...]`
// A 960 x 540 frame blurred to 32 x 18; CIE L* of every cell; reported two ways:
//   bands     the share of cells that are light (L* >= 45), mid (22 <= L* < 45) and dark (L* < 22)
//   clusters  3-means on L*: the three centroids and the gaps between them (the bible asks for >= 18 L* apart)
// and the share of the full frame under #0B0D12 (the grade's lift, which neither the viewer nor these frames have,
// removes those in the game: listed, not asserted).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const lstar = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const Y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
};

export async function squint(file, { light = 45, dark = 22 } = {}) {
  const data = await sharp(file).removeAlpha().resize(32, 18, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
  const Ls = []; for (let i = 0; i < data.length; i += 3) Ls.push(lstar(data[i], data[i + 1], data[i + 2]));
  const n = Ls.length, pc = (k) => Math.round((k / n) * 100);
  const nl = Ls.filter((l) => l >= light).length, nd = Ls.filter((l) => l < dark).length;
  const s = [...Ls].sort((a, b) => a - b);
  let c = [s[Math.floor(n * 0.3)], s[Math.floor(n * 0.8)], s[n - 3]], as = [];
  for (let it = 0; it < 40; it++) {
    as = Ls.map((l) => { let b = 0; for (let k = 1; k < 3; k++) if (Math.abs(l - c[k]) < Math.abs(l - c[b])) b = k; return b; });
    c = c.map((v, k) => { const m = Ls.filter((_, i) => as[i] === k); return m.length ? m.reduce((a, b) => a + b, 0) / m.length : v; });
  }
  const share = [0, 1, 2].map((k) => pc(as.filter((a) => a === k).length));
  const full = await sharp(file).removeAlpha().raw().toBuffer(); let under = 0;
  for (let i = 0; i < full.length; i += 3) if (full[i] < 0x0b && full[i + 1] < 0x0d && full[i + 2] < 0x12) under++;
  return `bands ${pc(nl)} : ${pc(n - nl - nd)} : ${pc(nd)}   clusters ${share[2]} : ${share[1]} : ${share[0]} at L* ${c[2].toFixed(0)} / ${c[1].toFixed(0)} / ${c[0].toFixed(0)} (gaps ${(c[2] - c[1]).toFixed(0)}, ${(c[1] - c[0]).toFixed(0)})   under #0B0D12 ${((under / (full.length / 3)) * 100).toFixed(1)} %`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of process.argv.slice(2)) console.log(f.split('/').slice(-1)[0].padEnd(46), await squint(f));
}
