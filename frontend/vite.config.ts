import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
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
