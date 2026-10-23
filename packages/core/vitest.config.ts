import { defineConfig } from 'vitest/config';

// Los Angeles, so the suite crosses a real DST change (Nov 1, 2026).
export default defineConfig({ test: { env: { TZ: 'America/Los_Angeles' }, include: ['test/**/*.test.ts'] } });
