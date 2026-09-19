import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { cesiumAssets } from './cesiumAssets.ts';
import { sharedPublicAssets } from './sharedPublicAssets.ts';

export default defineConfig(({ mode }) => ({
  server: {
    watch: {
      ignored: [
        '**/dist*/**',
        '**/public/edge-map/data/**',
        '**/public/edge-map/assets/**',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.SENTINEL_API_TARGET ?? 'http://127.0.0.1:8000',
        ws: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.SENTINEL_API_TARGET ?? 'http://127.0.0.1:8000',
        ws: true,
      },
    },
  },
  plugins: [
    tailwindcss(),
    cesiumAssets(),
    ...(process.env.SENTINEL_SHARED_PUBLIC === '1'
      ? [sharedPublicAssets()]
      : []),
    {
      name: 'flexlayout-published-css-map',
      enforce: 'pre',
      // 0.10.8 publishes this comment but omits the map. Keep vendor styles intact.
      transform(code, id) {
        if (
          id.replaceAll('\\', '/').includes('flexlayout-react/style/') &&
          id.endsWith('.css')
        ) {
          return code.replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
        }
      },
    },
  ],
  build: {
    copyPublicDir: process.env.SENTINEL_SHARED_PUBLIC !== '1',
    outDir: mode === 'verification' ? 'dist-verification' : 'dist',
    rolldownOptions: {
      // Cache stable runtime/engine code separately from the small application shell.
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-runtime',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'workspace-engine',
              test: /node_modules[\\/]flexlayout-react[\\/]/,
              priority: 10,
            },
          ],
        },
      },
      input:
        mode === 'verification'
          ? {
              app: resolve('index.html'),
              harness: resolve('tests/harness/index.html'),
            }
          : resolve('index.html'),
    },
  },
}));
