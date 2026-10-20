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

// Development check that the 3D board shows exactly the position the rules hold: the right piece
// on every occupied square, nothing on empty squares, no stray meshes, every piece standing on its
// square, and the computer never moving for the player.

import { SQUARES, squareToWorld, type Square } from '../scene/coords.ts';
import { pieceCode, type BoardMap, type Color } from '../game/types.ts';

export interface SceneSnapshot {
  readonly pieces: Partial<Record<Square, string>>;
  /** Piece meshes currently in the scene's piece group. */
  readonly meshCount: number;
  /** Where each piece's mesh actually stands. */
  readonly positions: Partial<Record<Square, { x: number; y: number; z: number }>>;
}

export interface MoveAudit {
  readonly color: Color;
  readonly byEngine: boolean;
}

export function checkConsistency(
  board: BoardMap,
  scene: SceneSnapshot,
  options: { humanColor?: Color; moves?: readonly MoveAudit[] } = {},
): string[] {
  const errors: string[] = [];
  for (const square of SQUARES) {
    const want = board[square] ? pieceCode(board[square]) : undefined;
    const have = scene.pieces[square];
    if (want !== have)
      errors.push(`${square}: rules have ${want ?? 'nothing'}, scene shows ${have ?? 'nothing'}`);
    const position = scene.positions[square];
    if (position) {
      const home = squareToWorld(square);
      if (
        Math.abs(position.x - home.x) > 1e-3 ||
        Math.abs(position.z - home.z) > 1e-3 ||
        Math.abs(position.y) > 1e-3
      ) {
        errors.push(`${square}: piece mesh is not on its square`);
      }
    }
  }
  const expected = Object.keys(board).length;
  if (scene.meshCount !== expected)
    errors.push(`scene has ${scene.meshCount} piece meshes, expected ${expected}`);
  if (options.humanColor && options.moves) {
    for (const move of options.moves) {
      if (move.byEngine && move.color === options.humanColor)
        errors.push('the engine moved for the player');
    }
  }
  return errors;
}
