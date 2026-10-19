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

// Guard: this product is Grandmaster 3D. The commercial game whose look inspired it is never named
// in anything we publish: not in source, identifiers, UI strings, docs or commit-tracked files.
// The needles are assembled from fragments so this file does not contain the words it forbids.

import { describe, expect, it } from 'vitest';
import { read, readableFiles } from './repoFiles.ts';

const FORBIDDEN: readonly string[] = [
  ['chess', 'master'].join(''),
  ['chess', ' ', 'master'].join(''),
  ['ubi', 'soft'].join(''),
];

const SKIP_FILES = [/^tests\/architecture\/branding\.test\.ts$/, /^package-lock\.json$/] as const;

describe('product naming', () => {
  const files = readableFiles().filter((file) => !SKIP_FILES.some((rule) => rule.test(file)));

  it('has files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('never mentions %s', (needle) => {
    const findings: string[] = [];
    for (const file of files) {
      if (file.toLowerCase().includes(needle)) findings.push(`${file} (file name)`);
      read(file)
        .toLowerCase()
        .split('\n')
        .forEach((line, index) => {
          if (line.includes(needle)) findings.push(`${file}:${index + 1}`);
        });
    }
    expect(findings, `Say "the reference" instead. Found at:\n${findings.join('\n')}`).toEqual([]);
  });

  it('names the product in the package manifest', () => {
    expect(JSON.parse(read('package.json')).name).toBe('grandmaster-3d');
  });
});
