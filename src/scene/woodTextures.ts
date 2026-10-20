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

// Procedural wood and cloth textures, drawn on canvases from a fixed seed so the board looks the
// same on every load. Nothing here is taken from an image: grain is layered noise-driven strokes.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { createNoise1D, createRng, range, type Rng } from '../core/rng.ts';

export interface GrainStyle {
  /** Base colour of the wood. */
  readonly base: string;
  /** Colour of the darker grain lines, as "r,g,b". */
  readonly line: string;
  /** Colour of the lighter figure bands, as "r,g,b". */
  readonly highlight: string;
  /** Grain lines per 100 px across the grain. */
  readonly density: number;
  /** Strength of the grain lines, 0..1. */
  readonly contrast: number;
  /** How far the lines wander, in px. */
  readonly waviness: number;
}

/**
 * Fills a rectangle with wood grain running along its length (horizontal when `vertical` is false).
 * The rectangle is drawn in its own rotated frame, so callers can lay grain in any direction.
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: GrainStyle,
  rng: Rng,
  vertical = false,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.translate(x, y);
  let length = width;
  let across = height;
  if (vertical) {
    ctx.translate(width, 0);
    ctx.rotate(Math.PI / 2);
    length = height;
    across = width;
  }
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, length, across);

  // Broad, soft figure bands give the wood its slow light and dark variation.
  const bands = Math.max(2, Math.round(across / 60));
  for (let i = 0; i < bands; i++) {
    const centre = range(rng, -0.1, 1.1) * across;
    const half = range(rng, 8, 40);
    const gradient = ctx.createLinearGradient(0, centre - half, 0, centre + half);
    const dark = rng() < 0.5;
    const colour = dark ? style.line : style.highlight;
    const alpha = range(rng, 0.04, 0.12) * style.contrast * 2;
    gradient.addColorStop(0, `rgba(${colour},0)`);
    gradient.addColorStop(0.5, `rgba(${colour},${alpha})`);
    gradient.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, centre - half, length, half * 2);
  }

  // Fine grain lines that wander with low-frequency noise.
  const lines = Math.round((across / 100) * style.density);
  const step = Math.max(4, length / 120);
  for (let i = 0; i < lines; i++) {
    const noise = createNoise1D(rng, 64);
    const baseY = range(rng, -0.05, 1.05) * across;
    const frequency = range(rng, 0.004, 0.012);
    const phase = range(rng, 0, 100);
    ctx.beginPath();
    for (let s = 0; s <= length + step; s += step) {
      const wander = noise(s * frequency + phase) * style.waviness;
      if (s === 0) ctx.moveTo(s, baseY + wander);
      else ctx.lineTo(s, baseY + wander);
    }
    ctx.strokeStyle = `rgba(${style.line},${range(rng, 0.05, 0.3) * style.contrast})`;
    ctx.lineWidth = range(rng, 0.6, 2.2);
    ctx.stroke();
  }

  // Pores: short dark flecks along the grain.
  const flecks = Math.round((length * across) / 900);
  ctx.fillStyle = `rgba(${style.line},${0.18 * style.contrast})`;
  for (let i = 0; i < flecks; i++) {
    ctx.fillRect(range(rng, 0, length), range(rng, 0, across), range(rng, 2, 7), 0.8);
  }
  ctx.restore();
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export const LIGHT_SQUARE: GrainStyle = {
  base: '#f2c48f',
  line: '176,120,64',
  highlight: '255,236,200',
  density: 22,
  contrast: 0.55,
  waviness: 3,
};

export const DARK_SQUARE: GrainStyle = {
  base: '#a47a4f',
  line: '110,66,28',
  highlight: '222,170,110',
  density: 24,
  contrast: 0.65,
  waviness: 3,
};

export const FRAME_WOOD: GrainStyle = {
  base: '#c8955b',
  line: '168,98,40',
  highlight: '255,212,150',
  density: 16,
  contrast: 0.6,
  waviness: 5,
};

export const CLOTH: GrainStyle = {
  base: '#1c4053',
  line: '8,36,50',
  highlight: '40,100,124',
  density: 30,
  contrast: 0.9,
  waviness: 9,
};

/** The 8x8 playing surface: one canvas, 256 px per square, a1 at the bottom left. */
export function createSquaresTexture(seed = 7, size = 2048): CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createRng(seed);
  const cell = size / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // Canvas row 0 is rank 8; a1 (col 0, row 7) is dark.
      const light = (col + row) % 2 === 0;
      drawGrain(
        ctx,
        col * cell,
        row * cell,
        cell,
        cell,
        light ? LIGHT_SQUARE : DARK_SQUARE,
        rng,
        true,
      );
    }
  }
  return toTexture(canvas);
}

export interface FrameLabels {
  /** Which side the files and ranks are read from. */
  readonly side: 'white' | 'black';
  readonly visible: boolean;
}

/**
 * The frame top as one canvas covering the whole 9x9-square board (frame strips plus the unused
 * centre), with mitred grain on each side and engraved coordinates along the viewer's near and left
 * edges.
 */
export function drawFrameCanvas(
  canvas: HTMLCanvasElement,
  frameWidth: number,
  labels: FrameLabels,
  seed = 11,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const size = canvas.width;
  const unit = size / (8 + 2 * frameWidth);
  const strip = frameWidth * unit;
  const rng = createRng(seed);

  // Centre and the side strips. Each strip is clipped to a trapezoid so the corners meet in mitres.
  drawGrain(ctx, 0, 0, size, size, FRAME_WOOD, rng);
  const sides: Array<{ poly: number[]; vertical: boolean }> = [
    { poly: [0, 0, size, 0, size - strip, strip, strip, strip], vertical: false },
    {
      poly: [0, size, size, size, size - strip, size - strip, strip, size - strip],
      vertical: false,
    },
    { poly: [0, 0, strip, strip, strip, size - strip, 0, size], vertical: true },
    {
      poly: [size, 0, size - strip, strip, size - strip, size - strip, size, size],
      vertical: true,
    },
  ];
  for (const side of sides) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < side.poly.length; i += 2) {
      const px = side.poly[i]!;
      const py = side.poly[i + 1]!;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
    drawGrain(ctx, 0, 0, size, size, FRAME_WOOD, rng, side.vertical);
    ctx.restore();
  }

  if (!labels.visible) return;
  const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const fontSize = unit * 0.3;
  ctx.font = `500 ${fontSize}px "Trebuchet MS", "DejaVu Sans", Verdana, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Engraved look: a faint dark edge above-left and the pale fill slightly below-right.
  const engrave = (text: string, cx: number, cy: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(120,64,20,0.35)';
    ctx.fillText(text, -unit * 0.012, -unit * 0.012);
    ctx.fillStyle = 'rgba(255,236,206,0.88)';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  // Canvas top is the rank-8 edge and canvas left the a-file edge. Each letter stays beside its own
  // file and each number beside its own rank; only the strip they sit in and their rotation follow
  // the viewer, so from Black they sit on Black's near and left edges and read upright.
  const white = labels.side === 'white';
  for (let i = 0; i < 8; i++) {
    const fileX = strip + (i + 0.5) * unit;
    const rankY = size - strip - (i + 0.5) * unit;
    if (white) {
      engrave(files[i]!, fileX, size - strip / 2, 0);
      engrave(ranks[i]!, strip / 2, rankY, 0);
    } else {
      engrave(files[i]!, fileX, strip / 2, Math.PI);
      engrave(ranks[i]!, size - strip / 2, rankY, Math.PI);
    }
  }
}

export function createFrameTexture(frameWidth: number, labels: FrameLabels): CanvasTexture {
  const [canvas] = makeCanvas(2048, 2048);
  drawFrameCanvas(canvas, frameWidth, labels);
  return toTexture(canvas);
}

/** The blue tablecloth, tiling. */
export function createClothTexture(seed = 3): CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  drawGrain(ctx, 0, 0, 1024, 1024, CLOTH, createRng(seed));
  const texture = toTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
