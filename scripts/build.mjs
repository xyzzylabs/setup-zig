// Bundle the action entry points into the committed dist/ tree.
//
// Replaces @vercel/ncc: ncc's ts-loader depends on the classic TypeScript
// compiler API (ts.sys, ts.createProgram, …) which TypeScript 7's native
// rewrite no longer exposes from its main entry, so ncc crashes on TS 7.
// esbuild bundles from the TypeScript sources directly and does not need
// that API.
//
// Output layout matches what ncc produced so action.yml keeps working:
//   dist/main/index.js  (+ package.json marker)
//   dist/post/index.js  (+ package.json marker)
//
// The project is ESM ("type": "module"), so we emit ESM. Some bundled
// dependencies (e.g. @actions/*) reach for CommonJS globals — require,
// __filename, __dirname — which do not exist in an ES module. ncc shimmed
// these via createRequire; we do the same with a banner.

import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Match the Action runtime declared in action.yml (runs.using: node24).
const target = 'node24';

const banner = {
  js: [
    "import { createRequire as __setupZigCreateRequire } from 'node:module';",
    "import { fileURLToPath as __setupZigFileURLToPath } from 'node:url';",
    "import { dirname as __setupZigDirname } from 'node:path';",
    'const require = __setupZigCreateRequire(import.meta.url);',
    'const __filename = __setupZigFileURLToPath(import.meta.url);',
    'const __dirname = __setupZigDirname(__filename);',
  ].join('\n'),
};

const entries = [
  { in: 'src/main.ts', outDir: 'dist/main' },
  { in: 'src/post.ts', outDir: 'dist/post' },
];

for (const entry of entries) {
  const outDir = join(root, entry.outDir);
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [join(root, entry.in)],
    outfile: join(outDir, 'index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target,
    banner,
    legalComments: 'none',
    logLevel: 'info',
  });

  // Pin the emitted bundle to ESM regardless of any parent package.json.
  await writeFile(
    join(outDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2) + '\n',
  );
}
