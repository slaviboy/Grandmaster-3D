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
  SQUARES,
  isLightSquare,
  isSquare,
  squareFromIndices,
  squareToWorld,
  worldToSquare,
} from '../../src/scene/coords.ts';

describe('board coordinates', () => {
  it('lists all 64 squares once', () => {
    expect(SQUARES).toHaveLength(64);
    expect(new Set(SQUARES).size).toBe(64);
  });

  it('places a1 near White at -x,+z and h8 at +x,-z', () => {
    expect(squareToWorld('a1')).toEqual({ x: -3.5, z: 3.5 });
    expect(squareToWorld('h8')).toEqual({ x: 3.5, z: -3.5 });
    expect(squareToWorld('e4')).toEqual({ x: 0.5, z: 0.5 });
  });

  it('round-trips every square through its centre and near its corners', () => {
    for (const square of SQUARES) {
      const { x, z } = squareToWorld(square);
      expect(worldToSquare(x, z)).toBe(square);
      expect(worldToSquare(x - 0.49, z + 0.49)).toBe(square);
      expect(worldToSquare(x + 0.49, z - 0.49)).toBe(square);
    }
  });

  it('returns null off the board', () => {
    expect(worldToSquare(-4.01, 0)).toBeNull();
    expect(worldToSquare(4.01, 0)).toBeNull();
    expect(worldToSquare(0, 4.01)).toBeNull();
    expect(worldToSquare(0, -4.01)).toBeNull();
    expect(squareFromIndices(8, 0)).toBeNull();
  });

  it('colours a1 dark and h1 light', () => {
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('d1')).toBe(true);
  });

  it('validates square names', () => {
    expect(isSquare('e4')).toBe(true);
    expect(isSquare('i1')).toBe(false);
    expect(isSquare('a9')).toBe(false);
  });
});
