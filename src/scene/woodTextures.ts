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
import type { BoardTheme, SlabVeins, SurfaceStyle, TableTheme } from './themes.ts';

/** The colours and strength of wood grain; theme surfaces carry these fields too. */
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

/** Paints one surface style into a rectangle: wood grain, marble or a plain finish. */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: SurfaceStyle,
  rng: Rng,
  vertical = false,
): void {
  if (style.pattern === 'wood') drawGrain(ctx, x, y, width, height, style, rng, vertical);
  else if (style.pattern === 'marble') drawMarble(ctx, x, y, width, height, style, rng);
  else drawPlain(ctx, x, y, width, height, style, rng);
}

/** Marble: soft clouds of lighter and darker stone crossed by thin branching veins. */
export function drawMarble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: SurfaceStyle,
  rng: Rng,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = style.base;
  ctx.fillRect(x, y, width, height);
  const size = Math.max(width, height);
  const clouds = Math.round(6 + (width * height) / 40000);
  for (let i = 0; i < clouds; i++) {
    const cx = x + rng() * width;
    const cy = y + rng() * height;
    const r = range(rng, 0.15, 0.55) * size;
    const colour = rng() < 0.5 ? style.line : style.highlight;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${colour},${range(rng, 0.08, 0.2) * style.contrast})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, width, height);
  }
  // Veins: wandering lines that occasionally fork.
  const veins = Math.max(2, Math.round((style.density * size) / 256));
  for (let i = 0; i < veins; i++) {
    let px = x + rng() * width;
    let py = y + rng() * height;
    let angle = range(rng, 0, Math.PI * 2);
    const steps = Math.round(range(rng, 20, 60));
    const step = size / 40;
    const alpha = range(rng, 0.15, 0.55) * style.contrast;
    let lineWidth = range(rng, 0.6, 2.4) * (size / 256);
    ctx.strokeStyle = `rgba(${style.line},${alpha})`;
    ctx.lineCap = 'round';
    for (let s = 0; s < steps; s++) {
      angle += range(rng, -0.45, 0.45);
      const nx = px + Math.cos(angle) * step;
      const ny = py + Math.sin(angle) * step;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      if (rng() < 0.06) {
        // A short fork.
        let fx = nx;
        let fy = ny;
        let fa = angle + range(rng, -1.2, 1.2);
        for (let f = 0; f < 8; f++) {
          fa += range(rng, -0.4, 0.4);
          const gx = fx + Math.cos(fa) * step * 0.7;
          const gy = fy + Math.sin(fa) * step * 0.7;
          ctx.lineWidth = lineWidth * 0.6;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(gx, gy);
          ctx.stroke();
          fx = gx;
          fy = gy;
        }
      }
      lineWidth = Math.max(0.3, lineWidth * range(rng, 0.94, 1.04));
      px = nx;
      py = ny;
    }
  }
  ctx.restore();
}

/**
 * Veins of a marble slab: long, gently bending light lines that ignore the squares, with a soft
 * glow around a crisp core, some splitting into thinner branches. `unit` is one square in pixels.
 */
export function drawSlabVeins(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  unit: number,
  veins: SlabVeins,
  rng: Rng,
): void {
  const count = Math.round((veins.count * width * height) / (64 * unit * unit));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (
    x: number,
    y: number,
    angle: number,
    length: number,
    weight: number,
    depth: number,
  ) => {
    const points: Array<[number, number]> = [[x, y]];
    const step = unit * 0.06;
    for (let travelled = 0; travelled < length; travelled += step) {
      // Mostly straight, with now and then a sharp kink.
      angle += rng() < 0.1 ? range(rng, -0.8, 0.8) : range(rng, -0.06, 0.06);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      points.push([x, y]);
      if (depth < 2 && rng() < 0.02) {
        trace(
          x,
          y,
          angle + range(rng, -0.9, 0.9),
          length * range(rng, 0.2, 0.45),
          weight * 0.55,
          depth + 1,
        );
      }
    }
    const alpha = veins.opacity * weight;
    const stroke = (lineWidth: number, a: number) => {
      ctx.strokeStyle = `rgba(${veins.colour},${a})`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.stroke();
    };
    stroke(unit * 0.05 * weight, alpha * 0.2);
    stroke(unit * 0.016 * weight, alpha);
  };
  for (let i = 0; i < count; i++) {
    trace(
      rng() * width,
      rng() * height,
      // Mostly diagonal, as the veins on the reference board run.
      range(rng, -0.5, 0.5) + (rng() < 0.5 ? Math.PI / 4 : (3 * Math.PI) / 4),
      range(rng, 1.5, 4) * unit,
      range(rng, 0.45, 1),
      0,
    );
  }
  ctx.restore();
}

/** A plain finish: the base colour with a faint mottle so it does not look like flat paint. */
export function drawPlain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: SurfaceStyle,
  rng: Rng,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = style.base;
  ctx.fillRect(x, y, width, height);
  const specks = Math.round((width * height) / 120);
  for (let i = 0; i < specks; i++) {
    const colour = rng() < 0.5 ? style.line : style.highlight;
    ctx.fillStyle = `rgba(${colour},${range(rng, 0.03, 0.12) * style.contrast})`;
    ctx.fillRect(x + rng() * width, y + rng() * height, range(rng, 1, 3), range(rng, 1, 3));
  }
  ctx.restore();
}

/** The 8x8 playing surface: one canvas, 256 px per square, a1 at the bottom left. */
export function createSquaresTexture(theme: BoardTheme, seed = 7, size = 2048): CanvasTexture {
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createRng(seed);
  const cell = size / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // Canvas row 0 is rank 8; a1 (col 0, row 7) is dark.
      const light = (col + row) % 2 === 0;
      drawSurface(
        ctx,
        col * cell,
        row * cell,
        cell,
        cell,
        light ? theme.light : theme.dark,
        rng,
        true,
      );
    }
  }
  if (theme.slabVeins) drawSlabVeins(ctx, size, size, cell, theme.slabVeins, rng);
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
  theme: BoardTheme,
  seed = 11,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const size = canvas.width;
  const unit = size / (8 + 2 * frameWidth);
  const strip = frameWidth * unit;
  const rng = createRng(seed);
  const frame = theme.frame;

  // Centre and the side strips. Each strip is clipped to a trapezoid so the corners meet in mitres.
  drawSurface(ctx, 0, 0, size, size, frame, rng);
  if (frame.pattern === 'wood') {
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
      drawGrain(ctx, 0, 0, size, size, frame, rng, side.vertical);
      ctx.restore();
    }
  }
  if (theme.slabVeins) drawSlabVeins(ctx, size, size, unit, theme.slabVeins, rng);

  if (!labels.visible) return;
  const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const fontSize = unit * (theme.labelSize ?? 0.3);
  ctx.font = `500 ${fontSize}px "Trebuchet MS", "DejaVu Sans", Verdana, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Engraved look: a faint edge above-left and the fill slightly below-right.
  const engrave = (text: string, cx: number, cy: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = theme.labelShadow;
    ctx.fillText(text, -unit * 0.012, -unit * 0.012);
    ctx.fillStyle = theme.labelColour;
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

export function createFrameTexture(
  frameWidth: number,
  labels: FrameLabels,
  theme: BoardTheme,
): CanvasTexture {
  const [canvas] = makeCanvas(2048, 2048);
  drawFrameCanvas(canvas, frameWidth, labels, theme);
  return toTexture(canvas);
}

/**
 * Cracked stone: irregular cells (a tiling Voronoi pattern) with thin dark cracks between them and
 * a little light in each cell's middle, like the table under the marble board in the reference.
 */
export function drawCracked(
  ctx: CanvasRenderingContext2D,
  size: number,
  style: SurfaceStyle,
  rng: Rng,
  cells = 9,
): void {
  const parse = (rgb: string) => rgb.split(',').map(Number) as [number, number, number];
  const base = [
    Number.parseInt(style.base.slice(1, 3), 16),
    Number.parseInt(style.base.slice(3, 5), 16),
    Number.parseInt(style.base.slice(5, 7), 16),
  ];
  const line = parse(style.line);
  const light = parse(style.highlight);
  // Two crack layers: large irregular cells, and finer crazing inside them.
  const layers = [cells, cells * 3].map((n) => ({
    n,
    pitch: size / n,
    seeds: Array.from({ length: n * n }, (_, k) => ({
      x: ((k % n) + range(rng, 0.02, 0.98)) * (size / n),
      y: (Math.floor(k / n) + range(rng, 0.02, 0.98)) * (size / n),
      tone: range(rng, -1, 1),
    })),
  }));
  const nearest = (layer: (typeof layers)[number], px: number, py: number) => {
    const gx = Math.floor(px / layer.pitch);
    const gy = Math.floor(py / layer.pitch);
    let f1 = Infinity;
    let f2 = Infinity;
    let tone = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (gx + dx + layer.n) % layer.n;
        const cy = (gy + dy + layer.n) % layer.n;
        const seed = layer.seeds[cy * layer.n + cx]!;
        // Wrap the seed position so the pattern tiles.
        const d = Math.hypot(
          px - (seed.x + (gx + dx - cx) * layer.pitch),
          py - (seed.y + (gy + dy - cy) * layer.pitch),
        );
        if (d < f1) {
          f2 = f1;
          f1 = d;
          tone = seed.tone;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { edge: f2 - f1, f1, tone };
  };
  // Tiling noise: a few sine waves with whole-number frequencies across the tile.
  const waves = Array.from({ length: 7 }, () => ({
    kx: Math.round(range(rng, -4, 4)) || 1,
    ky: Math.round(range(rng, -4, 4)) || 2,
    phase: range(rng, 0, Math.PI * 2),
    amp: range(rng, 0.4, 1),
  }));
  const ampSum = waves.reduce((a, w) => a + w.amp, 0);
  const tiled = (px: number, py: number, scale = 1, shift = 0) => {
    let v = 0;
    for (const w of waves) {
      v +=
        w.amp * Math.sin((2 * Math.PI * scale * (w.kx * px + w.ky * py)) / size + w.phase + shift);
    }
    return v / ampSum;
  };
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const big = nearest(layers[0]!, px, py);
      const fine = nearest(layers[1]!, px, py);
      // Mottled stone: slow two-axis noise plus a little per-cell tone.
      const mottle = tiled(px, py) * 0.7 + tiled(px, py, 3, 1.7) * 0.3;
      const k = 1 + (big.tone * 0.06 + mottle * 0.12) * style.contrast;
      const glow = Math.max(0, mottle) * 0.35 * style.contrast;
      let r = base[0]! * k + (light[0] - base[0]!) * glow;
      let g = base[1]! * k + (light[1] - base[1]!) * glow;
      let b = base[2]! * k + (light[2] - base[2]!) * glow;
      const wobble = tiled(px, py, 9, 0.4);
      const crack = Math.max(0, 1 - big.edge / (1.4 + wobble * 0.8));
      const craze = Math.max(0, 1 - fine.edge / 0.9) * 0.45 * (0.5 + 0.5 * tiled(px, py, 5, 2.9));
      const t = Math.min(1, crack + craze);
      r += (line[0] - r) * t;
      g += (line[1] - g) * t;
      b += (line[2] - b) * t;
      // A faint light rim along each big crack, as on glazed stone.
      const rim = big.edge > 1.6 && big.edge < 3.4 ? 0.12 * style.contrast : 0;
      const i = (py * size + px) * 4;
      data[i] = r + (light[0] - r) * rim;
      data[i + 1] = g + (light[1] - g) * rim;
      data[i + 2] = b + (light[2] - b) * rim;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Felt or velvet: fine fibre noise over gentle blotches. */
export function drawFelt(
  ctx: CanvasRenderingContext2D,
  size: number,
  style: SurfaceStyle,
  rng: Rng,
): void {
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const r = range(rng, 0.1, 0.3) * size;
    const colour = rng() < 0.5 ? style.line : style.highlight;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${colour},${0.12 * style.contrast})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * 26 * style.contrast;
    data[i] = data[i]! + n;
    data[i + 1] = data[i + 1]! + n;
    data[i + 2] = data[i + 2]! + n;
  }
  ctx.putImageData(image, 0, 0);
}

/** The table under the board, tiling. */
export function createTableTexture(theme: TableTheme, seed = 3): CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rng = createRng(seed);
  if (theme.pattern === 'cracked') drawCracked(ctx, 1024, theme.surface, rng);
  else if (theme.pattern === 'felt') drawFelt(ctx, 1024, theme.surface, rng);
  else drawGrain(ctx, 0, 0, 1024, 1024, theme.surface, rng);
  const texture = toTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
