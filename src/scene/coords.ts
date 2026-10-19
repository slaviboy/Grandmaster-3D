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

// The single board coordinate convention. 1 world unit = 1 square. The board centre is the origin,
// the playing surface is y = 0, files a..h run along +x and ranks 1..8 along -z, so White sits at +z
// (the default camera side). Flipping the board rotates the camera, never the board, so these
// mappings hold for the whole game.

export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type Square = `${File}${Rank}`;

export const FILES: readonly File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS: readonly Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const SQUARES: readonly Square[] = RANKS.flatMap((r) =>
  FILES.map((f) => `${f}${r}` as Square),
);

export interface BoardPoint {
  readonly x: number;
  readonly z: number;
}

/** 0-based file and rank indices of a square. */
export function squareIndices(square: Square): { file: number; rank: number } {
  return { file: square.charCodeAt(0) - 97, rank: square.charCodeAt(1) - 49 };
}

export function squareFromIndices(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

/** Centre of a square on the playing surface. */
export function squareToWorld(square: Square): BoardPoint {
  const { file, rank } = squareIndices(square);
  return { x: file - 3.5, z: 3.5 - rank };
}

/** The square under a point on the playing surface, or null off the board. */
export function worldToSquare(x: number, z: number): Square | null {
  return squareFromIndices(Math.floor(x + 4), Math.floor(4 - z));
}

export function isLightSquare(square: Square): boolean {
  const { file, rank } = squareIndices(square);
  return (file + rank) % 2 === 1;
}
