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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/engine/difficulty.ts';
import { opponentPortrait } from '../../src/ui/portraits.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('opponent portraits', () => {
  it('ships a 240x300 portrait for every level', () => {
    for (const level of DIFFICULTIES) {
      const { src, alt } = opponentPortrait(level.id, level.rating);
      expect(src).toMatch(new RegExp(`portraits/${level.id}\\.jpg$`));
      expect(alt).toMatch(/^Portrait of /);
      const jpeg = readFileSync(join(root, 'public', 'portraits', `${level.id}.jpg`));
      expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
      // The size sits in the first start-of-frame marker.
      const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
      expect(jpeg.readUInt16BE(sof + 7), `${level.id} width`).toBe(240);
      expect(jpeg.readUInt16BE(sof + 5), `${level.id} height`).toBe(300);
    }
  });

  it('gives a custom rating the nearest level’s portrait', () => {
    expect(opponentPortrait('custom', 450).src).toMatch(/beginner\.jpg$/);
    expect(opponentPortrait('custom', 1550).src).toMatch(/medium\.jpg$/);
    expect(opponentPortrait('custom', 2100).src).toMatch(/hard\.jpg$/);
    expect(opponentPortrait('custom', 2300).src).toMatch(/expert\.jpg$/);
    expect(opponentPortrait('custom', 3000).src).toMatch(/maximum\.jpg$/);
  });

  it('credits every source', () => {
    const credits = readFileSync(join(root, 'art', 'portraits', 'CREDITS.md'), 'utf8');
    for (const level of DIFFICULTIES) expect(credits).toContain(`| ${level.label} |`);
  });
});
