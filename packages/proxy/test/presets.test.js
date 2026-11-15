import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PRESET_IDS } from '../lib/handler.js';

test('proxy preset ids match packages/core presets', () => {
  const src = readFileSync(new URL('../../core/src/presets.ts', import.meta.url), 'utf8');
  const ids = [...src.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...PRESET_IDS], ids);
});
