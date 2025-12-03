import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const iconDir = join(process.cwd(), 'icons');
if (!existsSync(iconDir)) {
  mkdirSync(iconDir, { recursive: true });
}

// Simple transparent PNG (1x1). We reuse it for all required sizes to avoid shipping binaries in git.
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y0nTwAAAABJRU5ErkJggg==';
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const target = join(iconDir, `icon${size}.png`);
  writeFileSync(target, Buffer.from(base64Png, 'base64'));
}

console.log(`Generated placeholder icons in ${iconDir}`);
