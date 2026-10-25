// Change only the dev emulator profile. Restore metaQuest3/home_office before
// committing. IWSDK restarts an active managed server when this file changes.
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../iwsdk.config.json', import.meta.url);
const device = process.argv[2] ?? 'metaQuest3';
const environment = process.argv[3] ?? 'home_office';
if (!['metaQuest3', 'metaVRGlasses'].includes(device)) throw new Error('Choose metaQuest3 or metaVRGlasses.');
if (!['home_office', 'kitchen'].includes(environment)) throw new Error('Choose home_office or kitchen.');
const config = JSON.parse(readFileSync(path, 'utf8'));
config.dev.emulator = { ...config.dev.emulator, device, environment };
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Emulator: ${device}, ${environment}`);
