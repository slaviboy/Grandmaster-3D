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

// Small previews of each look, painted with the same code that paints the board and table.

import { createRng } from '../core/rng.ts';
import type { BoardTheme, PieceStyle, PieceTheme, TableTheme } from '../scene/themes.ts';
import { drawCracked, drawFelt, drawGrain, drawSurface } from '../scene/woodTextures.ts';

const WIDTH = 120;
const HEIGHT = 80;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = WIDTH;
  c.height = HEIGHT;
  c.className = 'swatch-canvas';
  return [c, c.getContext('2d')!];
}

/** A corner of the board: a frame strip around a 2x2 patch of squares. */
export function boardSwatch(theme: BoardTheme): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const rng = createRng(5);
  drawSurface(ctx, 0, 0, WIDTH, HEIGHT, theme.frame, rng);
  const inset = 10;
  const cell = (HEIGHT - inset) / 2;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const light = (row + col) % 2 === 0;
      drawSurface(
        ctx,
        inset + col * cell,
        inset + row * cell,
        cell,
        cell,
        light ? theme.light : theme.dark,
        rng,
        true,
      );
    }
  }
  return c;
}

function disc(ctx: CanvasRenderingContext2D, x: number, style: PieceStyle): void {
  const y = HEIGHT / 2;
  const r = 26;
  if (style.finish === 'glass' || style.finish === 'gloss') {
    // Glass: see-through with a bright rim, or mirror-black with one sharp highlight.
    const clear = style.finish === 'glass';
    const g = ctx.createRadialGradient(x - 8, y - 9, 1, x, y, r);
    g.addColorStop(0, clear ? 'rgba(255,255,255,0.9)' : '#5a6068');
    g.addColorStop(0.25, clear ? 'rgba(235,245,242,0.35)' : style.light);
    g.addColorStop(1, clear ? 'rgba(210,228,222,0.55)' : style.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = clear ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = clear ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(x - 9, y - 11, 6, 3, -0.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(x - 9, y - 10, 2, x, y, r);
  const sheen = style.finish === 'metal' ? '#ffffff' : style.light;
  g.addColorStop(0, sheen);
  g.addColorStop(0.35, style.light);
  g.addColorStop(1, style.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (style.finish === 'wood' || style.finish === 'lacquer') {
    // A few growth rings.
    ctx.strokeStyle = `rgba(0,0,0,${0.12 * style.contrast + 0.05})`;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + 4, y + 3, k * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (style.finish === 'stone') {
    ctx.strokeStyle = `rgba(0,0,0,${0.25 * style.contrast})`;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y + 6);
    ctx.bezierCurveTo(x - 6, y - 10, x + 4, y + 14, x + r * 0.8, y - 4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Two polished discs, one per side. */
export function pieceSwatch(theme: PieceTheme): HTMLCanvasElement {
  const [c, ctx] = canvas();
  ctx.fillStyle = '#16465a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  disc(ctx, 32, theme.w);
  disc(ctx, 88, theme.b);
  return c;
}

/** A tile of the table surface. */
export function tableSwatch(theme: TableTheme): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const rng = createRng(3);
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const t = tile.getContext('2d')!;
  if (theme.pattern === 'cracked') drawCracked(t, 128, theme.surface, rng, 3);
  else if (theme.pattern === 'felt') drawFelt(t, 128, theme.surface, rng);
  else drawGrain(t, 0, 0, 128, 128, theme.surface, rng);
  ctx.drawImage(tile, 0, 0, 128, 128, 0, 0, WIDTH, WIDTH);
  return c;
}
