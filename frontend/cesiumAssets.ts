import { createReadStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import type { Plugin } from 'vite';

/** Serve the package's own workers/WASM/assets, identically in dev and production. */
export function cesiumAssets(): Plugin {
  const source = resolve('node_modules/cesium/Build/Cesium');
  const folders = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];
  let output = '',
    base = '/';
  return {
    name: 'sentinel-cesium-assets',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir, 'cesium');
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use(`${base}cesium/`, (request, response, next) => {
        const relative = decodeURIComponent(
          (request.url ?? '').split('?')[0],
        ).replace(/^\/+/, '');
        const file = resolve(source, relative);
        if (
          !folders.includes(relative.split('/')[0]) ||
          !file.startsWith(`${source}${sep}`)
        ) {
          next();
          return;
        }
        void stat(file)
          .then((info) => {
            if (!info.isFile()) {
              next();
              return;
            }
            const mime: Record<string, string> = {
              '.js': 'text/javascript',
              '.wasm': 'application/wasm',
              '.json': 'application/json',
              '.png': 'image/png',
              '.svg': 'image/svg+xml',
              '.css': 'text/css',
              '.jpg': 'image/jpeg',
            };
            response.setHeader(
              'Content-Type',
              mime[extname(file)] ?? 'application/octet-stream',
            );
            createReadStream(file).pipe(response);
          })
          .catch(() => next());
      });
    },
    async writeBundle() {
      await mkdir(output, { recursive: true });
      await Promise.all(
        folders.map((folder) =>
          cp(resolve(source, folder), resolve(output, folder), {
            recursive: true,
          }),
        ),
      );
    },
  };
}
