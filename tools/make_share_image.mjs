// tools/make_share_image.mjs: the picture a link to the game shows when it is pasted into a chat or a post
// (index.html `og:image`). Cuts a 1280 x 720 frame of the real game (the title screen, by default the release's first
// hero frame) to the 1200 x 630 card shape and writes public/share.jpg.
//
//   node tools/make_share_image.mjs [frame.png]        default: shots/i1-fixer/release_title.png
//
// Re-run it whenever the title frame changes (the gun, the overhang, the title's type): the closer of a pass does.
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = path.resolve(process.argv[2] ?? path.join(ROOT, 'shots/i1-fixer/release_title.png'));
const out = path.join(ROOT, 'public/share.jpg');
const W = 1200, H = 630;

const meta = await sharp(src).metadata();
// the widest 1200:630 window of the frame, centred
const cropH = Math.min(meta.height, Math.round(meta.width * H / W));
const cropW = Math.round(cropH * W / H);
const left = Math.floor((meta.width - cropW) / 2), top = Math.floor((meta.height - cropH) / 2);
await sharp(src).extract({ left, top, width: cropW, height: cropH }).resize(W, H, { kernel: 'lanczos3' })
  .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:2:0' }).toFile(out);
console.log(`${path.relative(ROOT, out)}: ${W} x ${H}, ${fs.statSync(out).size} B, from ${path.relative(ROOT, src)}`);
