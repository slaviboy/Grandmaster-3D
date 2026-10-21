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
  NO_EDGES,
  SPAN,
  cellSize,
  fitBoard,
  squareAtPoint,
  toBoard,
  toScreen,
  type BoardRect,
} from '../../src/flat/flatGeometry.ts';
import { SQUARES, squareToWorld } from '../../src/scene/coords.ts';

const RECT: BoardRect = { cx: 500, cy: 400, size: 90 * SPAN };

describe('2D board geometry', () => {
  it('puts a1 at the bottom left seen from White and at the top right seen from Black', () => {
    const a1 = squareToWorld('a1');
    const white = toScreen(a1.x, a1.z, 'white', RECT);
    const black = toScreen(a1.x, a1.z, 'black', RECT);
    expect(white.x).toBeLessThan(RECT.cx);
    expect(white.y).toBeGreaterThan(RECT.cy);
    expect(black.x).toBeGreaterThan(RECT.cx);
    expect(black.y).toBeLessThan(RECT.cy);
    expect(cellSize(RECT)).toBe(90);
  });

  it('finds every square at its own centre from both sides', () => {
    for (const side of ['white', 'black'] as const) {
      for (const square of SQUARES) {
        const { x, z } = squareToWorld(square);
        const p = toScreen(x, z, side, RECT);
        expect(squareAtPoint(p.x, p.y, side, RECT)).toBe(square);
        const back = toBoard(p.x, p.y, side, RECT);
        expect(back.x).toBeCloseTo(x);
        expect(back.z).toBeCloseTo(z);
      }
    }
  });

  it('finds no square on the frame or beyond it', () => {
    const half = RECT.size / 2;
    expect(squareAtPoint(RECT.cx, RECT.cy - half + 10, 'white', RECT)).toBeNull();
    expect(squareAtPoint(RECT.cx - half - 50, RECT.cy, 'black', RECT)).toBeNull();
  });

  it('fits the board in the space the interface leaves free', () => {
    const rect = fitBoard(1200, 800, { top: 60, right: 220, bottom: 40, left: 200 });
    // 700 px tall and 780 px wide are free: the height decides.
    expect(rect.size).toBeCloseTo(700 * 0.96);
    expect(rect.cx).toBe(200 + 780 / 2);
    expect(rect.cy).toBe(60 + 700 / 2);
    expect(fitBoard(1000, 600, NO_EDGES)).toEqual({ cx: 500, cy: 300, size: 600 * 0.96 });
  });

  it('lets side panels float over the board when keeping clear would shrink it too much', () => {
    const rect = fitBoard(700, 800, { top: 50, right: 260, bottom: 50, left: 0 });
    expect(rect.cx).toBe(350);
    expect(rect.size).toBeCloseTo(700 * 0.96);
  });
});
