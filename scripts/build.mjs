// Production build: bundles the React client (hashed assets) and the Node server into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

export function clientOptions({ minify = true } = {}) {
  return {
    entryPoints: { app: 'src/client/main.tsx' },
    bundle: true,
    minify,
    sourcemap: true,
    format: 'esm',
    target: ['es2022', 'safari16'],
    jsx: 'automatic',
    outdir: 'dist/client/assets',
    entryNames: '[name]-[hash]',
    metafile: true,
    define: { 'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development') },
    logLevel: 'warning',
  };
}

/** Writes index.html pointing at the hashed bundles, and copies static files. */
export function writeIndex(metafile) {
  const outputs = Object.keys(metafile.outputs);
  const js = outputs.find((f) => f.endsWith('.js'));
  const css = outputs.find((f) => f.endsWith('.css'));
  const html = readFileSync('src/client/index.html', 'utf8')
    .replace('__JS__', `/assets/${basename(js)}`)
    .replace('__CSS__', `/assets/${basename(css)}`);
  writeFileSync('dist/client/index.html', html);
  cpSync('public', 'dist/client', { recursive: true });
}

export async function buildClient(opts) {
  rmSync('dist/client', { recursive: true, force: true });
  mkdirSync('dist/client/assets', { recursive: true });
  const result = await build(clientOptions(opts));
  writeIndex(result.metafile);
}

export async function buildServer() {
  await build({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: 'dist/server/index.js',
    sourcemap: true,
    // Lets bundled CommonJS dependencies (pdf-lib) call require() inside an ES module.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildClient();
  await buildServer();
  console.log('Build complete: dist/client and dist/server');
}
