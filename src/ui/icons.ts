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

// Original flat piece icons (Staunton silhouettes) and interface glyphs, drawn for this project.

import type { Color, PieceKind } from '../game/types.ts';

const BASE = 'M10 33.5h25v3a1.5 1.5 0 0 1-1.5 1.5h-22a1.5 1.5 0 0 1-1.5-1.5z';

const PIECE_PATHS: Record<PieceKind, string> = {
  p: 'M22.5 7a5 5 0 0 1 3.2 8.8c1.6.6 2.6 1.6 2.6 2.7 0 1-.8 1.8-2 2.3 1.1 3.6 3 7.4 6 10.2H12.7c3-2.8 4.9-6.6 6-10.2-1.2-.5-2-1.3-2-2.3 0-1.1 1-2.1 2.6-2.7A5 5 0 0 1 22.5 7z',
  r: 'M12 8h4.2v3.2h4V8h4.6v3.2h4V8H33v6.5l-3 2.3v11.5l3 3.2H12l3-3.2V16.8l-3-2.3z',
  b: 'M22.5 5.5a2.3 2.3 0 0 1 1.4 4.1c3.7 2.4 6.3 6.1 6.3 9.7 0 2.6-1.4 4.4-3.6 5.3l1.5 3.4H16.9l1.5-3.4c-2.2-.9-3.6-2.7-3.6-5.3 0-3.6 2.6-7.3 6.3-9.7a2.3 2.3 0 0 1 1.4-4.1zM24.6 13.4l-4.9 6.1 1.5 1.2 4.9-6.1zM14.5 29.5h16l2 3.4h-20z',
  n: 'M14.5 31.5c-.4-5.6 2.2-9.4 6.3-12.4-2.6-.3-5 .9-7.1 2.8-1.9-.9-2.8-2.7-2.4-4.6 1.4-4.2 5.3-7 8.5-10.1-.1-1.7.6-3.2 1.7-4.2l1.6 2.6c6.3.6 11.5 6 11.5 15.4v10.5z',
  q: 'M9.5 12.5l4.8 10.4 2.7-11.4 3.4 10.6 2.1-12.6 2.1 12.6 3.4-10.6 2.7 11.4 4.8-10.4-2.6 15.2H12.1zM12 29h21l1 3.5H11z',
  k: 'M21 4.5h3v3.2h3.2v3H24V14h-3v-3.3h-3.2v-3H21zM12.6 17.6c3.1-2.2 6.7-3.1 9.9-3.1s6.8.9 9.9 3.1c2.1 1.6 2.5 4.2 1.1 6.3l-3.1 5.2H14.6l-3.1-5.2c-1.4-2.1-1-4.7 1.1-6.3zM13.5 30h18l1 3H12.5z',
};

/** An inline SVG of a piece: white pieces pale with a dark outline, black dark with a light one. */
export function pieceSvg(color: Color, kind: PieceKind, size = 24): string {
  const fill = color === 'w' ? '#ffffff' : '#101820';
  const stroke = color === 'w' ? '#12303d' : '#e8f4f8';
  return `<svg class="piece-icon" width="${size}" height="${size}" viewBox="0 0 45 45" aria-hidden="true"><path d="${PIECE_PATHS[kind]} ${BASE}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

/** A piece's outline for drawing inside another SVG: the path in a 45x45 box. */
export function piecePath(kind: PieceKind): string {
  return `${PIECE_PATHS[kind]} ${BASE}`;
}

/** Glyphs for the round action buttons and window controls. */
export const GLYPHS = {
  newGame:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h9l5 5v11H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 4v5h5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 12v6M9 15h6" stroke="currentColor" stroke-width="1.8"/></svg>',
  // A U-turn arrow: the head and the shaft meet at (4, 9); the shaft turns back below.
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  resign:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 4h11l-2.5 4L17 12H6" fill="currentColor"/></svg>',
  hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 19h5M10.5 21.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 3v4h-4M5.5 21v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  moves:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
} as const;

const line = (d: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Thin line icons for the modern interface. */
export const LINE_ICONS = {
  plus: line('M12 5v14M5 12h14'),
  topView: line(
    'M5 4.5h14a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5zM4.5 12h15M12 4.5v15',
  ),
  fullscreen: line('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
  first: line('M6.5 5v14M17.5 6l-7 6 7 6'),
  prev: line('M15 6l-6 6 6 6'),
  next: line('M9 6l6 6-6 6'),
  last: line('M17.5 5v14M6.5 6l7 6-7 6'),
  moveNow: line('M13 3L5.5 13.5H11L10 21l8-11h-5.5z'),
  close: line('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  chevronDown: line('M6 9.5l6 6 6-6'),
  chevronRight: line('M9.5 6l6 6-6 6'),
  check: line('M5 12.5l4.5 4.5L19 7.5'),
  sliders: line('M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5'),
  mic: line(
    'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5v3',
  ),
  micOff: line(
    'M15 10.5v-4a3 3 0 0 0-5.6-1.5M9 9v2.5a3 3 0 0 0 4.6 2.5M6 11.5a6 6 0 0 0 9.4 4.9M18 11.5a6 6 0 0 1-.4 2.1M12 17.5v3M4 4l16 16',
  ),
  camera: line(
    'M4.5 7h9a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7zM15 10.5l5-3v9l-5-3',
  ),
  cameraOff: line(
    'M9 7h4.5A1.5 1.5 0 0 1 15 8.5v3M15 15.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7M15 10.5l5-3v9l-3.5-2.1M4 4l16 16',
  ),
  speaker: line('M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'),
  speakerOff: line('M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5'),
  coach: line(
    'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 10h8M8 13h5',
  ),
} as const;
