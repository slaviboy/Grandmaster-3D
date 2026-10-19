/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * This file is part of Grandmaster 3D.
 *
 * Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version. See the LICENSE file for the full terms.
 */

// Copies the single-threaded lite Stockfish build from node_modules into public/engine/, where
// the browser loads it as a Web Worker. The engine stays an unmodified, separate GPL program.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let packageDir;
try {
  packageDir = dirname(require.resolve('stockfish/package.json'));
} catch {
  console.warn('copy-engine: stockfish is not installed yet; skipping.');
  process.exit(0);
}

const target = join(root, 'public', 'engine');
mkdirSync(target, { recursive: true });
const files = [
  ['bin/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
  ['Copying.txt', 'COPYING.txt'],
];
for (const [from, to] of files) {
  const source = join(packageDir, from);
  if (!existsSync(source)) throw new Error(`copy-engine: missing ${source}`);
  cpSync(source, join(target, to));
}
