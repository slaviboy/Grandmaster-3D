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

// Where the 2D board sits on screen, and how its points map to the board. The 2D board uses the
// world coordinates of coords.ts (1 unit = 1 square, files along +x, White at +z) seen straight
// from above: from White's side +z points down the screen, from Black's side the view is turned
// half a circle. Flipping turns this view, never the board, just as the 3D camera does.

import { worldToSquare, type BoardPoint, type Square } from '../scene/coords.ts';

/** The side the board is seen from (White or Black at the bottom). */
export type Side = 'white' | 'black';

/** Pixels along each edge of the window covered by the interface. */
export interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

/** The board on screen: its centre and the length of a side, frame included, in CSS pixels. */
export interface BoardRect {
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
}

/** The frame around the squares, in squares: as wide as the 3D board's. */
export const FRAME = 0.5;
/** The whole board, frame included, in squares. */
export const SPAN = 8 + 2 * FRAME;

/** The part of the free space the board fills, leaving a little air around it. */
const FILL = 0.96;
/** Side panels may float over the board when keeping clear of them would shrink it below this. */
const NARROW = 0.72;

/**
 * The largest board that fits the window clear of the interface, centred in the free space. When
 * the side panels would squeeze it too much (a narrow window), they are ignored and float over it.
 */
export function fitBoard(width: number, height: number, edges: Edges): BoardRect {
  const free = (left: number, right: number) => {
    const w = Math.max(0, width - left - right);
    const h = Math.max(0, height - edges.top - edges.bottom);
    return { cx: left + w / 2, cy: edges.top + h / 2, size: Math.min(w, h) * FILL };
  };
  const clear = free(edges.left, edges.right);
  const open = free(0, 0);
  return clear.size >= open.size * NARROW ? clear : open;
}

/** Pixels per square. */
export function cellSize(rect: BoardRect): number {
  return rect.size / SPAN;
}

/** The screen point of a board point. */
export function toScreen(
  x: number,
  z: number,
  side: Side,
  rect: BoardRect,
): { x: number; y: number } {
  const k = cellSize(rect) * (side === 'white' ? 1 : -1);
  return { x: rect.cx + x * k, y: rect.cy + z * k };
}

/** The board point under a screen point. */
export function toBoard(px: number, py: number, side: Side, rect: BoardRect): BoardPoint {
  const k = cellSize(rect) * (side === 'white' ? 1 : -1);
  return { x: (px - rect.cx) / k, z: (py - rect.cy) / k };
}

/** The square under a screen point, or null off the squares (on the frame or beyond). */
export function squareAtPoint(px: number, py: number, side: Side, rect: BoardRect): Square | null {
  const { x, z } = toBoard(px, py, side, rect);
  return worldToSquare(x, z);
}
