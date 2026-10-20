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

// What a polished piece standing on the board sees around it, as a reflection map: the board's
// squares below, the table cloth towards the horizon, the backdrop above it and the lamp overhead.
// The room environment gives neutral reflections; this one makes metal pieces mirror the board
// they stand on, as on the marble-board reference, where the silver pieces show its veins.

import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
  type WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { createRng } from '../core/rng.ts';
import type { BoardTheme, TableTheme } from './themes.ts';
import { drawSurface } from './woodTextures.ts';

/** Columns of squares around the full turn, and rows of squares from the horizon down. */
const COLUMNS = 16;
const ROWS = 6;

/**
 * Paints the surroundings as an equirectangular image: the top row is straight up, the middle row
 * the horizon, the bottom row straight down.
 */
export function drawSurroundings(
  canvas: HTMLCanvasElement,
  board: BoardTheme,
  table: TableTheme,
  seed = 11,
): void {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const horizon = height / 2;
  const rng = createRng(seed);

  // Above: the lamp-lit ceiling fading into the backdrop at the horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.55, '#dfe6ea');
  sky.addColorStop(1, table.background);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);
  // The key light, high up on the right-hand side (see ChessScene), and a weaker fill.
  for (const [u, v, r, a] of [
    [0.59, 0.16, 0.09, 1],
    [0.25, 0.3, 0.07, 0.5],
  ] as const) {
    const g = ctx.createRadialGradient(u * width, v * height, 0, u * width, v * height, r * width);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, horizon);
  }

  // Just below the horizon: the table stretching away.
  const cloth = horizon + height * 0.06;
  drawSurface(ctx, 0, horizon, width, cloth - horizon, table.surface, rng);

  // Further down: the board's squares, taller the steeper one looks down.
  const cell = width / COLUMNS;
  let top = cloth;
  for (let row = 0; row < ROWS; row++) {
    const bottom = cloth + (height - cloth) * Math.pow((row + 1) / ROWS, 0.8);
    for (let col = 0; col < COLUMNS; col++) {
      const surface = (row + col) % 2 === 0 ? board.light : board.dark;
      drawSurface(ctx, col * cell, top, cell, bottom - top, surface, rng);
    }
    top = bottom;
  }
}

/**
 * Keeps one reflection map of the surroundings up to date. The filtered map always lives in the
 * same render target, so materials that use it follow board and table changes without a restyle.
 */
export class Surroundings {
  private readonly pmrem: PMREMGenerator;
  private readonly canvas = document.createElement('canvas');
  private target: WebGLRenderTarget | null = null;

  constructor(renderer: WebGLRenderer) {
    this.pmrem = new PMREMGenerator(renderer);
    this.canvas.width = 512;
    this.canvas.height = 256;
  }

  /** The filtered map, or null before the first update. */
  get texture(): Texture | null {
    return this.target?.texture ?? null;
  }

  update(board: BoardTheme, table: TableTheme): Texture {
    drawSurroundings(this.canvas, board, table);
    const source = new CanvasTexture(this.canvas);
    source.mapping = EquirectangularReflectionMapping;
    source.colorSpace = SRGBColorSpace;
    this.target = this.pmrem.fromEquirectangular(source, this.target);
    source.dispose();
    return this.target.texture;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
