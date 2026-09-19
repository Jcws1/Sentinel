// One credential-free production output; canonical public assets stay shared.
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

Object.assign(process.env, {
  VITE_TACTICAL_PROVIDER: 'maptiler',
  VITE_MAPTILER_KEY: '',
  VITE_CESIUM_ION_TOKEN: '',
  VITE_GOOGLE_MAPS_API_KEY: '',
  VITE_CESIUM_PHOTOREALISTIC_ASSET_ID: '0',
});
await build({
  mode: 'production',
  build: { outDir: 'dist-d5-video-overlay', copyPublicDir: false },
});
mkdirSync('.cache', { recursive: true });
writeFileSync(
  resolve('.cache/d5-video-overlay-preview.mjs'),
  `
import { mergeConfig } from 'vite';
import base from '../vite.config.ts';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
const publicRoot = resolve('public');
export default env => mergeConfig(base(env), { plugins: [{
  name: 'task-only-shared-public-assets',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) return next();
      let file, stat;
      try {
        file = resolve(publicRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!file.startsWith(publicRoot + sep)) return next();
        stat = statSync(file);
        if (!stat.isFile()) return next();
      } catch { return next(); }
      const types = { '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.pbf': 'application/x-protobuf' };
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      let start = 0, end = stat.size - 1;
      if (req.headers.range) {
        const match = /^bytes=(\\d+)-(\\d*)$/.exec(req.headers.range);
        if (!match) { res.statusCode = 416; return res.end(); }
        start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= stat.size) { res.statusCode = 416; return res.end(); }
        res.statusCode = 206;
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + stat.size);
      }
      res.setHeader('Content-Length', end - start + 1);
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  }
}] });
`,
);
