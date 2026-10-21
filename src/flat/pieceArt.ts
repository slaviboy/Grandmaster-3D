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

// The 2D board's pieces: flat Staunton figures drawn for this project. Each is a stack of parts
// painted back to front (fill, then a dark outline), so every collar and joint shows as a line,
// plus detail lines in a contrasting colour: dark on the light side, light on the dark side, as
// classic diagrams draw them. The colours come from the chosen piece set.

import type { PieceKind } from '../game/types.ts';
import { lightness, shade, type PieceStyle } from '../scene/themes.ts';

/** The art is drawn in a box of this size, the base resting near its bottom. */
export const ART_SIZE = 100;

export interface PieceArt {
  /** Outlines filled with the piece colour, back to front. */
  readonly parts: readonly string[];
  /** Lines drawn on top in the detail colour. */
  readonly details: readonly string[];
  /** Small shapes filled with the detail colour (the knight's eye). */
  readonly dots: readonly string[];
}

const BASE = 'M24 80h52a4 4 0 0 1 4 4v4a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2v-4a4 4 0 0 1 4-4z';
const BASE_LINE = 'M26 84.5H74';
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;

// Shared by the queen and the king: the flared foot and the band above it.
const ROYAL_FOOT = 'M34 63C33 69 30 75 27 80H73C70 75 67 69 66 63Z';
const ROYAL_BAND = 'M31 57H69V64H31Z';

export const PIECE_ART: Readonly<Record<PieceKind, PieceArt>> = {
  p: {
    parts: [
      BASE,
      'M39 49C39 61 33 71 28 80H72C67 71 61 61 61 49Z',
      ellipse(50, 47, 17, 5.5),
      circle(50, 30, 12),
    ],
    details: [BASE_LINE, 'M35 49.5C42 52 58 52 65 49.5'],
    dots: [],
  },
  r: {
    parts: [
      BASE,
      'M24 72H76V80H24Z',
      'M32 72L35 41H65L68 72Z',
      'M28 34H72V41H28Z',
      'M26 14H36V21H44V14H56V21H64V14H74V34H26Z',
    ],
    details: [BASE_LINE, 'M27 76H73', 'M34.5 45H65.5', 'M33.5 68H66.5', 'M30 30H70'],
    dots: [],
  },
  n: {
    parts: [
      BASE,
      'M26 72H74V80H26Z',
      // The head faces left: back of the neck, ears, forehead, muzzle, jaw, throat and chest.
      'M70 72C74 56 72 34 61 24L59 12L53 19L48 11L44 21C34 26 25 37 20 48C18 53 21 59 27 58' +
        'C32 57 36 54 43 52C40 59 35 65 32 72Z',
    ],
    details: [
      BASE_LINE,
      'M29 76H71',
      // The mane, the nostril and the mouth.
      'M58 22C66 32 68 48 66 68',
      'M23 50.5Q25 49 27 51',
      'M30 56.5Q34 55 37 53.5',
    ],
    dots: [ellipse(45.6, 31, 2.6, 2)],
  },
  b: {
    parts: [
      BASE,
      'M36 80C38 70 41 64 43 58H57C59 64 62 70 64 80Z',
      ellipse(50, 57, 14, 4.5),
      'M50 18C60 26 66 36 64 45C62 51 56 53 50 53C44 53 38 51 36 45C34 36 40 26 50 18Z',
      circle(50, 13, 5),
    ],
    // The mitre's slit and its rim.
    details: [BASE_LINE, 'M57 29L46 41', 'M39 48C44 50 56 50 61 48'],
    dots: [],
  },
  q: {
    parts: [
      BASE,
      ROYAL_FOOT,
      ROYAL_BAND,
      'M33 58L22 31L33 45L36 23L44 41L50 19L56 41L64 23L67 45L78 31L67 58Z',
      circle(22, 31, 4),
      circle(36, 23, 4),
      circle(50, 19, 4),
      circle(64, 23, 4),
      circle(78, 31, 4),
    ],
    details: [BASE_LINE, 'M33 60.5H67', 'M35 53H65'],
    dots: [],
  },
  k: {
    parts: [
      BASE,
      ROYAL_FOOT,
      ROYAL_BAND,
      'M33 58C29 50 28 42 32 37H68C72 42 71 50 67 58Z',
      'M36 37C36 29 42 24 50 24C58 24 64 29 64 37Z',
      'M47 5H53V11H59V17H53V24H47V17H41V11H47Z',
    ],
    details: [BASE_LINE, 'M33 60.5H67', 'M34 41H66', 'M35 53H65'],
    dots: [],
  },
};

export interface PieceColours {
  /** The fill runs from `top` (lit) to `bottom`. */
  readonly top: string;
  readonly bottom: string;
  readonly outline: string;
  readonly detail: string;
  /** A soft edge around the figure, so dark pieces stay visible on dark squares. */
  readonly halo: string;
}

/** Flat colours for one side of a piece set, with outline and detail lines that stand out. */
export function pieceColours(style: PieceStyle): PieceColours {
  const body = style.light;
  const light = lightness(body) >= 0.5;
  const to = (hex: string, target: number) => shade(hex, target - lightness(hex));
  const depth = style.finish === 'metal' ? 0.16 : 0.08;
  return {
    top: shade(body, 0.06),
    bottom: shade(body, -depth),
    outline: to(style.dark, light ? 0.13 : 0.05),
    detail: light ? to(style.dark, 0.3) : to(body, Math.max(0.78, lightness(body) + 0.3)),
    halo: light ? 'rgba(0,0,0,0.2)' : 'rgba(255,246,230,0.5)',
  };
}

/** Line widths in art units. */
const OUTLINE_WIDTH = 2.4;
const DETAIL_WIDTH = 1.8;
const HALO_WIDTH = 6;

const paths = new Map<string, Path2D>();

function path(d: string): Path2D {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}

/** Draws a piece filling the `size` square whose top-left corner is (x, y). */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  kind: PieceKind,
  colours: PieceColours,
  x: number,
  y: number,
  size: number,
): void {
  const art = PIECE_ART[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / ART_SIZE, size / ART_SIZE);
  // Lit from the upper left, like the 3D board.
  const fill = ctx.createLinearGradient(25, 10, 75, 90);
  fill.addColorStop(0, colours.top);
  fill.addColorStop(1, colours.bottom);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // The halo goes under the whole figure in one stroke (so overlaps don't darken it); the fills
  // cover it everywhere but around the edge.
  ctx.strokeStyle = colours.halo;
  ctx.lineWidth = HALO_WIDTH;
  ctx.stroke(path(art.parts.join(' ')));
  ctx.fillStyle = fill;
  ctx.strokeStyle = colours.outline;
  ctx.lineWidth = OUTLINE_WIDTH;
  for (const d of art.parts) {
    const p = path(d);
    ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.strokeStyle = colours.detail;
  ctx.lineWidth = DETAIL_WIDTH;
  for (const d of art.details) ctx.stroke(path(d));
  ctx.fillStyle = colours.detail;
  for (const d of art.dots) ctx.fill(path(d));
  ctx.restore();
}
