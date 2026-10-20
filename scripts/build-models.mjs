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

// Rebuilds the chess pieces with Blender: models the set, exports the GLBs, renders previews.
// Usage: npm run models [-- build|export|previews ...]   (default: all three steps)
// Set BLENDER to the Blender executable if it is not in the default macOS location.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const blend = join(root, 'blender', 'chess_set.blend');
const steps = {
  build: [],
  export: [blend],
  previews: [blend],
  fragments: [blend],
};
const scripts = {
  build: 'build_set.py',
  export: 'export_glb.py',
  previews: 'render_previews.py',
  fragments: 'fracture.py',
};
const requested = process.argv.slice(2);
const order = requested.length ? requested : ['build', 'export', 'previews'];

for (const step of order) {
  if (!(step in steps)) {
    console.error(`unknown step "${step}"; use build, export, previews or fragments`);
    process.exit(1);
  }
  const args = [
    '--background',
    ...steps[step],
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    join(root, 'blender', 'scripts', scripts[step]),
  ];
  console.log(`\n== ${step}`);
  const result = spawnSync(blender, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
