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

// Builds the computer opponents' portraits, one per difficulty, from art/portraits/sources/ into
// public/portraits/. The sources are public-domain paintings and a Blender render of an automaton
// (blender/scripts/robot_portrait.py); see art/portraits/CREDITS.md. Every portrait gets the same
// treatment so they read as one set: the same head-and-shoulders crop, a light brushwork filter
// (stronger for the render, which starts out smoother), a warm varnish tone, a vignette and a fine
// canvas weave. Runs in headless Chromium for its canvas: `npm run portraits`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = join(root, 'art', 'portraits', 'sources');
const out = join(root, 'public', 'portraits');
const WIDTH = 240;
const HEIGHT = 300;

/** Crop of each source in its own pixels (4:5, head in the upper middle), and brushwork radius. */
const PORTRAITS = [
  { id: 'beginner', file: 'beginner.jpg', crop: [0, 70, 651, 814], brush: 1 },
  { id: 'easy', file: 'easy.jpg', crop: [40, 20, 820, 1025], brush: 1 },
  { id: 'medium', file: 'medium.jpg', crop: [0, 30, 460, 575], brush: 1 },
  { id: 'hard', file: 'hard.jpg', crop: [150, 110, 680, 850], brush: 1 },
  { id: 'expert', file: 'expert.jpg', crop: [90, 20, 860, 1075], brush: 1 },
  { id: 'maximum', file: 'maximum.png', crop: [0, 0, 768, 960], brush: 3 },
];

/** Runs in the page: crops, filters and grades one portrait, returning a JPEG data URL. */
function treat({ data, crop, brush, width, height }) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const [x, y, w, h] = crop;
      ctx.drawImage(image, x, y, w, h, 0, 0, width, height);
      const src = ctx.getImageData(0, 0, width, height);
      const px = src.data;
      const dst = ctx.createImageData(width, height);
      const o = dst.data;

      // Kuwahara filter: each pixel takes the mean of the calmest of its four neighbouring
      // quadrants, which flattens texture into brush-like patches while keeping edges.
      const r = brush;
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          let best = Infinity;
          let mean = [0, 0, 0];
          for (const [dx, dy] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            let sr = 0;
            let sg = 0;
            let sb = 0;
            let sl = 0;
            let sl2 = 0;
            let n = 0;
            for (let v = 0; v <= r; v++) {
              for (let u = 0; u <= r; u++) {
                const xx = Math.min(width - 1, Math.max(0, i + u * dx));
                const yy = Math.min(height - 1, Math.max(0, j + v * dy));
                const k = (yy * width + xx) * 4;
                const l = px[k] * 0.3 + px[k + 1] * 0.59 + px[k + 2] * 0.11;
                sr += px[k];
                sg += px[k + 1];
                sb += px[k + 2];
                sl += l;
                sl2 += l * l;
                n++;
              }
            }
            const variance = sl2 / n - (sl / n) ** 2;
            if (variance < best) {
              best = variance;
              mean = [sr / n, sg / n, sb / n];
            }
          }
          const k = (j * width + i) * 4;
          o[k] = mean[0];
          o[k + 1] = mean[1];
          o[k + 2] = mean[2];
          o[k + 3] = 255;
        }
      }

      // Warm varnish, a gentle S-curve, a vignette and a canvas weave, the same for every portrait.
      const curve = (v) => {
        const t = v / 255;
        return 255 * (t * t * (3 - 2 * t) * 0.35 + t * 0.65);
      };
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          const k = (j * width + i) * 4;
          const lum = (o[k] * 0.3 + o[k + 1] * 0.59 + o[k + 2] * 0.11) / 255;
          // Varnish: warm the image and lift the deepest shadows towards umber.
          const warm = [1.04, 0.98, 0.86];
          const umber = [34, 26, 18];
          const dx = (i / width - 0.5) / 0.62;
          const dy = (j / height - 0.42) / 0.7;
          const vignette = 1 - 0.38 * Math.min(1, Math.max(0, Math.hypot(dx, dy) - 0.35) * 1.4);
          const weave =
            1 + 0.025 * (Math.sin(i * 2.1) * Math.sin(j * 2.1) + Math.sin((i + j) * 0.9) * 0.5);
          for (let c = 0; c < 3; c++) {
            let v = curve(o[k + c]) * warm[c];
            v = v + (umber[c] - v) * 0.18 * (1 - lum);
            o[k + c] = Math.max(0, Math.min(255, v * vignette * weave));
          }
        }
      }
      ctx.putImageData(dst, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    image.src = data;
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(out, { recursive: true });
for (const portrait of PORTRAITS) {
  const bytes = readFileSync(join(sources, portrait.file));
  const type = portrait.file.endsWith('.png') ? 'png' : 'jpeg';
  const url = await page.evaluate(treat, {
    data: `data:image/${type};base64,${bytes.toString('base64')}`,
    crop: portrait.crop,
    brush: portrait.brush,
    width: WIDTH,
    height: HEIGHT,
  });
  const jpeg = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(out, `${portrait.id}.jpg`), jpeg);
  console.log(`${portrait.id}.jpg  ${(jpeg.length / 1024).toFixed(1)} KB`);
}
await browser.close();
