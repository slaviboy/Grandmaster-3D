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

// Marks on the playing surface, painted the same way for the 3D board and the 2D one: thin white
// rings on the last move's squares (as in the reference), a light-blue selected square, dots for
// legal moves (rings on captures), a red glow under a king in check, hint rings, the keyboard
// cursor and the square a dragged piece would land on. The painter draws into a square area with
// rank 8 at the top and the a-file on the left; the caller places and turns that area.

import { squareIndices, type Square } from './coords.ts';

export interface HighlightState {
  readonly lastMove?: { readonly from: Square; readonly to: Square };
  readonly selected?: Square;
  readonly targets?: readonly Square[];
  /** Targets that capture, drawn as rings instead of dots. */
  readonly captures?: readonly Square[];
  readonly check?: Square;
  readonly hint?: { readonly from: Square; readonly to: Square };
  readonly cursor?: Square;
  readonly dropTarget?: Square;
  /** Chess Coach aids: tinted squares, spots for captures and checks, circled pawns. */
  readonly zones?: readonly Square[];
  readonly zoneColour?: string;
  readonly spots?: readonly Square[];
  readonly pawnMarks?: readonly Square[];
}

export interface MarkOptions {
  readonly showLegal: boolean;
  readonly showLast: boolean;
}

/** The drawing calls the painter uses, so tests can record them without a browser. */
export type MarkContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'fillRect'
  | 'strokeRect'
  | 'setLineDash'
  | 'createRadialGradient'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
>;

/** Paints every mark of `state` into the `size` x `size` area at the context's origin. */
export function paintMarks(
  ctx: MarkContext,
  state: HighlightState,
  options: MarkOptions,
  size: number,
): void {
  const cell = size / 8;
  const centre = (square: Square): [number, number] => {
    const { file, rank } = squareIndices(square);
    return [(file + 0.5) * cell, (7 - rank + 0.5) * cell];
  };
  const ring = (square: Square, colour: string, radius = 0.4, width = 0.055) => {
    const [x, y] = centre(square);
    ctx.beginPath();
    ctx.arc(x, y, radius * cell, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * cell;
    ctx.stroke();
  };
  const s = state;

  if (s.zones?.length && s.zoneColour) {
    ctx.fillStyle = s.zoneColour;
    for (const square of s.zones) {
      const { file, rank } = squareIndices(square);
      ctx.fillRect(file * cell, (7 - rank) * cell, cell, cell);
    }
  }

  if (s.check) {
    const [x, y] = centre(s.check);
    const glow = ctx.createRadialGradient(x, y, cell * 0.05, x, y, cell * 0.62);
    glow.addColorStop(0, 'rgba(255,40,20,0.85)');
    glow.addColorStop(0.55, 'rgba(230,30,10,0.45)');
    glow.addColorStop(1, 'rgba(200,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - cell, y - cell, cell * 2, cell * 2);
  }

  if (s.selected) {
    const { file, rank } = squareIndices(s.selected);
    ctx.fillStyle = 'rgba(91,169,200,0.82)';
    ctx.fillRect(file * cell, (7 - rank) * cell, cell, cell);
  }

  if (s.dropTarget) {
    const { file, rank } = squareIndices(s.dropTarget);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = cell * 0.06;
    ctx.strokeRect(
      file * cell + cell * 0.04,
      (7 - rank) * cell + cell * 0.04,
      cell * 0.92,
      cell * 0.92,
    );
  }

  if (options.showLast && s.lastMove) {
    ring(s.lastMove.from, 'rgba(255,255,255,0.9)');
    ring(s.lastMove.to, 'rgba(255,255,255,0.9)');
  }

  if (s.hint) {
    ring(s.hint.from, 'rgba(120,230,120,0.95)', 0.36, 0.07);
    ring(s.hint.to, 'rgba(120,230,120,0.95)', 0.36, 0.07);
  }

  if (options.showLegal && s.targets) {
    const captures = new Set(s.captures ?? []);
    for (const target of s.targets) {
      const [x, y] = centre(target);
      if (captures.has(target)) {
        ring(target, 'rgba(24,74,96,0.6)', 0.44, 0.075);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(24,74,96,0.5)';
        ctx.fill();
      }
    }
  }

  for (const square of s.spots ?? []) ring(square, 'rgba(255,150,40,0.9)', 0.3, 0.06);
  for (const square of s.pawnMarks ?? []) ring(square, 'rgba(255,225,90,0.95)', 0.42, 0.05);

  if (s.cursor) {
    const { file, rank } = squareIndices(s.cursor);
    ctx.setLineDash([cell * 0.12, cell * 0.08]);
    ctx.strokeStyle = 'rgba(255,230,120,0.95)';
    ctx.lineWidth = cell * 0.05;
    ctx.strokeRect(
      file * cell + cell * 0.05,
      (7 - rank) * cell + cell * 0.05,
      cell * 0.9,
      cell * 0.9,
    );
    ctx.setLineDash([]);
  }
}
