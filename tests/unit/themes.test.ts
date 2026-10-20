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
import {
  BOARD_THEMES,
  CUSTOM_ID,
  DEFAULT_CUSTOM,
  PIECE_THEMES,
  TABLE_THEMES,
  boardTheme,
  isHexColour,
  pieceTheme,
  shade,
  tableTheme,
  type SurfaceStyle,
} from '../../src/scene/themes.ts';

const rgb = /^\d{1,3},\d{1,3},\d{1,3}$/;

function checkSurface(s: SurfaceStyle, where: string) {
  expect(isHexColour(s.base), `${where} base`).toBe(true);
  expect(s.line, `${where} line`).toMatch(rgb);
  expect(s.highlight, `${where} highlight`).toMatch(rgb);
}

describe('themes', () => {
  it('has unique ids and labels in every category', () => {
    for (const list of [BOARD_THEMES, PIECE_THEMES, TABLE_THEMES]) {
      const ids = list.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(CUSTOM_ID);
      expect(new Set(list.map((t) => t.label)).size).toBe(list.length);
    }
    expect(BOARD_THEMES.length).toBeGreaterThanOrEqual(6);
    expect(PIECE_THEMES.length).toBeGreaterThanOrEqual(7);
    expect(TABLE_THEMES.length).toBeGreaterThanOrEqual(5);
  });

  it('uses valid colours throughout', () => {
    for (const t of BOARD_THEMES) {
      checkSurface(t.light, `${t.id} light`);
      checkSurface(t.dark, `${t.id} dark`);
      checkSurface(t.frame, `${t.id} frame`);
    }
    for (const t of PIECE_THEMES) {
      for (const side of [t.w, t.b]) {
        for (const c of [side.light, side.dark, side.endGrain])
          expect(isHexColour(c), `${t.id} ${c}`).toBe(true);
        expect(side.metalness).toBeGreaterThanOrEqual(0);
        expect(side.metalness).toBeLessThanOrEqual(1);
      }
    }
    for (const t of TABLE_THEMES) {
      checkSurface(t.surface, t.id);
      expect(isHexColour(t.background)).toBe(true);
    }
  });

  it('keeps the measured default look as the first preset of each category', () => {
    const board = boardTheme('classic');
    expect(board.light.base).toBe('#f2c48f');
    expect(board.dark.base).toBe('#a47a4f');
    expect(board.frame.base).toBe('#c8955b');
    const pieces = pieceTheme('classic');
    expect(pieces.w.light).toBe('#d6b68e');
    expect(pieces.b.dark).toBe('#463021');
    expect(tableTheme('teal').surface.base).toBe('#1c4053');
    expect(tableTheme('teal').background).toBe('#154458');
  });

  it('falls back to the default for unknown ids', () => {
    expect(boardTheme('nope').id).toBe('classic');
    expect(pieceTheme('nope').id).toBe('classic');
    expect(tableTheme('nope').id).toBe('teal');
  });

  it('builds the Custom themes from picked colours with derived shades', () => {
    const custom = {
      ...DEFAULT_CUSTOM,
      light: '#ffffff',
      dark: '#204080',
      frame: '#f0e0c0',
      boardPattern: 'marble' as const,
    };
    const board = boardTheme(CUSTOM_ID, custom);
    expect(board.light.base).toBe('#ffffff');
    expect(board.dark.pattern).toBe('marble');
    checkSurface(board.dark, 'custom dark');
    // A light frame gets dark engraving so the letters stay readable.
    expect(board.labelColour).toMatch(/^rgba\(40/);
    const pieces = pieceTheme(CUSTOM_ID, {
      ...custom,
      white: '#ffe0a0',
      black: '#202020',
      finish: 'metal',
    });
    expect(pieces.w.metalness).toBeGreaterThan(0.5);
    expect(isHexColour(pieces.b.endGrain)).toBe(true);
    expect(tableTheme(CUSTOM_ID, { ...custom, table: '#336699' }).surface.base).toBe('#336699');
  });

  it('shades colours lighter and darker', () => {
    expect(shade('#808080', 0.2)).toBe('#b3b3b3');
    expect(shade('#808080', -0.5)).toBe('#000000');
    expect(shade('#ff0000', 0)).toBe('#ff0000');
  });
});
