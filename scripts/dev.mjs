// Local development: rebuilds the client on change and restarts the API server on change.
import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { clientOptions, writeIndex } from './build.mjs';

rmSync('dist/client', { recursive: true, force: true });
mkdirSync('dist/client/assets', { recursive: true });
const ctx = await context({
  ...clientOptions({ minify: false }),
  entryNames: '[name]',
  plugins: [{ name: 'index-html', setup: (b) => b.onEnd((r) => r.metafile && writeIndex(r.metafile)) }],
});
await ctx.watch();
console.log('Watching src/client for changes');

const server = spawn(
  process.execPath,
  ['--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', '--watch', '--watch-path=src/server', '--watch-path=src/shared', '--watch-path=config', 'src/server/index.ts'],
  { stdio: 'inherit', env: { NODE_ENV: 'development', ...process.env } },
);
server.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => server.kill('SIGINT'));
