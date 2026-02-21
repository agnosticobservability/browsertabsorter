import * as esbuild from 'esbuild';
import { rmSync, existsSync } from 'fs';

// Clean dist directory first
if (existsSync('build')) {
  rmSync('build', { recursive: true, force: true });
}

try {
  await esbuild.build({
    entryPoints: [
      'src/background/serviceWorker.ts',
      'src/ui/popup.ts',
      'src/ui/devtools.ts'
    ],
    bundle: true,
    outdir: 'build',
    format: 'esm',
    target: ['es2020'],
    platform: 'browser',
    // sourcemap: 'inline', // Disabled to avoid source map conflicts
    minify: false, // Keep readable for now
    logLevel: 'info',
  });
  console.log('Build complete');
} catch (e) {
  console.error('Build failed', e);
  process.exit(1);
}
