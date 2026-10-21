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

import { describe, expect, it } from 'vitest';
import { PIECE_ART, pieceColours } from '../../src/flat/pieceArt.ts';
import type { PieceKind } from '../../src/game/types.ts';
import {
  CUSTOM_ID,
  DEFAULT_CUSTOM,
  PIECE_THEMES,
  isHexColour,
  lightness,
  pieceTheme,
} from '../../src/scene/themes.ts';

const KINDS: readonly PieceKind[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const PATH_DATA = /^[MmLlHhVvCcQqAaZz0-9\s.,-]+$/;

describe('2D piece art', () => {
  it('has outlined parts for every kind, all of it plain path data', () => {
    for (const kind of KINDS) {
      const art = PIECE_ART[kind];
      expect(art.parts.length, kind).toBeGreaterThanOrEqual(3);
      for (const d of [...art.parts, ...art.details, ...art.dots]) {
        expect(d, kind).toMatch(PATH_DATA);
        expect(d.trimStart()[0], kind).toBe('M');
      }
    }
  });

  it('gives every piece set outlines and details that stand out from the piece', () => {
    const sets = [...PIECE_THEMES, pieceTheme(CUSTOM_ID, DEFAULT_CUSTOM)];
    for (const theme of sets) {
      for (const style of [theme.w, theme.b]) {
        const c = pieceColours(style);
        const where = `${theme.id} ${style.light}`;
        for (const colour of [c.top, c.bottom, c.outline, c.detail]) {
          expect(isHexColour(colour), where).toBe(true);
        }
        const body = lightness(style.light);
        // Near-black pieces can't have a darker outline; a light halo marks their edge instead.
        if (body > 0.25) expect(body - lightness(c.outline), where).toBeGreaterThan(0.12);
        else expect(c.halo, where).toMatch(/^rgba\(255,/);
        expect(Math.abs(body - lightness(c.detail)), where).toBeGreaterThan(0.2);
        expect(lightness(c.top), where).toBeGreaterThanOrEqual(lightness(c.bottom));
      }
    }
  });

  it('draws dark pieces with light details and a light halo, light pieces the other way', () => {
    const classic = PIECE_THEMES.find((t) => t.id === 'classic')!;
    const white = pieceColours(classic.w);
    const black = pieceColours(classic.b);
    expect(lightness(white.detail)).toBeLessThan(lightness(classic.w.light));
    expect(lightness(black.detail)).toBeGreaterThan(lightness(classic.b.light));
    expect(white.halo).toMatch(/^rgba\(0,0,0,/);
    expect(black.halo).toMatch(/^rgba\(255,/);
  });
});
