import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Verification previews share canonical public files instead of copying map packs. */
export function sharedPublicAssets(): Plugin {
  const publicRoot = resolve('public');
  return {
    name: 'verification-shared-public-assets',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method ?? '')) return next();
        let file: string;
        let stat;
        try {
          file = resolve(
            publicRoot,
            '.' +
              decodeURIComponent(
                new URL(req.url ?? '/', 'http://localhost').pathname,
              ),
          );
          if (!file.startsWith(publicRoot + sep)) return next();
          stat = statSync(file);
          if (!stat.isFile()) return next();
        } catch {
          return next();
        }
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.json': 'application/json',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.jpg': 'image/jpeg',
          '.pbf': 'application/x-protobuf',
          '.woff2': 'font/woff2',
        };
        res.setHeader(
          'Content-Type',
          types[extname(file)] ?? 'application/octet-stream',
        );
        res.setHeader('Accept-Ranges', 'bytes');
        let start = 0;
        let end = stat.size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (!match) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return res.end();
          }
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), end) : end;
          if (start > end || start >= stat.size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        }
        res.setHeader('Content-Length', Math.max(0, end - start + 1));
        if (req.method === 'HEAD' || stat.size === 0) return res.end();
        const stream = createReadStream(file, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      });
    },
  };
}
