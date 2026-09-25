import { createReadStream } from 'node:fs';
import { cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Serves pdf.js's character maps and standard font data from our own origin.
 *
 * Without the cmaps, a PDF that uses CID-keyed fonts (common in LaTeX and some
 * design-tool exports) extracts as unmapped glyph codes rather than text. The
 * standard font data does the same job for PDFs that reference one of the base
 * 14 fonts without embedding it. Both are fetched only when a document needs
 * them, so the cost is zero for the common case.
 *
 * They are copied from node_modules at build time rather than committed, which
 * keeps them locked to the installed pdfjs-dist version.
 */
function pdfjsAssets(): Plugin {
  const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
  const sources = [
    ['cmaps', 'pdf/cmaps'],
    ['standard_fonts', 'pdf/standard_fonts'],
  ] as const;

  let outDir = 'dist';
  let publicDir: string | false = '';

  return {
    name: 'hireready:pdfjs-assets',

    configResolved(config) {
      outDir = config.build.outDir;
      publicDir = config.publicDir;
    },

    // In dev there is no build output, so read straight from node_modules.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const match = /^\/pdf\/(cmaps|standard_fonts)\/([A-Za-z0-9._-]+)$/.exec(path);
        if (!match) {
          next();
          return;
        }

        const dir = match[1];
        const file = match[2];
        // The character class above already excludes separators and dots-only
        // names, so no traversal is reachable here.
        if (!dir || !file) {
          next();
          return;
        }

        createReadStream(join(pdfjsRoot, dir, file))
          .on('open', () => {
            res.setHeader('Content-Type', 'application/octet-stream');
          })
          .on('error', () => {
            res.statusCode = 404;
            res.end('Not found');
          })
          .pipe(res);
      });
    },

    async closeBundle() {
      if (publicDir === false) return;
      for (const [from, to] of sources) {
        await cp(join(pdfjsRoot, from), join(outDir, to), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [pdfjsAssets()],
  resolve: {
    alias: {
      '@core': resolvePath('./src/core'),
      '@ui': resolvePath('./src/ui'),
      '@lib': resolvePath('./src/lib'),
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: true,
    // Bundles stay small enough that inlining hurts caching more than it helps.
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        landing: resolvePath('./index.html'),
        app: resolvePath('./resume-score.html'),
        privacy: resolvePath('./privacy.html'),
        notFound: resolvePath('./404.html'),
      },
      /*
       * No manualChunks here on purpose. The parsers are behind dynamic
       * imports (see src/core/parsers/index.ts), which already splits pdf.js
       * and JSZip into their own chunks fetched on first use. Forcing them
       * into named manual chunks made them static dependencies of the app
       * entry, which added a `modulepreload` for ~430kB of pdf.js on every
       * visit to /resume-score.
       */
    },
  },
  server: {
    port: 5173,
    open: '/index.html',
  },
  preview: {
    port: 4173,
  },
  worker: {
    format: 'es',
  },
});
