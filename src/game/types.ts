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

// Chess types shared by the game logic, the scene and the UI. They mirror chess.js's own
// vocabulary ('w'/'b', 'p'..'k') so values pass between them unchanged.

import type { Square } from '../scene/coords.ts';

export type { Square };
export type Color = 'w' | 'b';
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionKind = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  readonly color: Color;
  readonly kind: PieceKind;
}

/** Occupied squares only. */
export type BoardMap = Partial<Record<Square, Piece>>;

export const PIECE_NAMES: Record<PieceKind, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const COLOR_NAMES: Record<Color, 'white' | 'black'> = { w: 'white', b: 'black' };

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/** "wP", "bK" ...: compact piece codes for snapshots and logs. */
export function pieceCode(piece: Piece): string {
  return piece.color + piece.kind.toUpperCase();
}

/** Reads the piece-placement field of a FEN into a board map. */
export function boardFromFen(fen: string): BoardMap {
  const board: BoardMap = {};
  const rows = (fen.split(' ')[0] ?? '').split('/');
  rows.forEach((row, index) => {
    const rank = 8 - index;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const square = `${'abcdefgh'[file]}${rank}` as Square;
      const lower = ch.toLowerCase() as PieceKind;
      board[square] = { color: ch === lower ? 'b' : 'w', kind: lower };
      file += 1;
    }
  });
  return board;
}
