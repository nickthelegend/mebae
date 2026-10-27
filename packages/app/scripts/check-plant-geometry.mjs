// CPU geometry regression checks. No browser, WebGL context or persisted fixture.
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const app = fileURLToPath(new URL('..', import.meta.url));
const cache = join(app, 'node_modules/.cache');
await mkdir(cache, { recursive: true });
const temp = await mkdtemp(join(cache, 'mebae-geometry-'));
try {
  const outfile = join(temp, 'check.mjs');
  await build({
    absWorkingDir: app,
    entryPoints: ['test/plant-geometry.ts'],
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    alias: { '@mebae/core': join(app, '../core/src/index.ts') },
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(temp, { recursive: true, force: true });
}
