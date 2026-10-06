// Tiny static server on an OS-assigned port (never hardcode a port). Serves the project root.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.json': 'application/json', '.wasm': 'application/wasm', '.webp': 'image/webp', '.ktx2': 'image/ktx2' };
export function serve() {
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      try {
        const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const data = await readFile(p);
        res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }).end(data);
      } catch { res.writeHead(404).end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
