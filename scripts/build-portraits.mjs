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

// Builds the computer opponents' portraits, one per difficulty, from the illustrated level cards in
// art/portraits/sources/ (see art/portraits/CREDITS.md). Each portrait is the card's picture,
// without its gold border and label, cropped to head and shoulders at 4:5 and scaled to the
// Game Status card. The cards already share one look, so nothing else is changed. Runs in
// headless Chromium for its canvas: `npm run portraits`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = join(root, 'art', 'portraits', 'sources');
const out = join(root, 'public', 'portraits');
const WIDTH = 240;
const HEIGHT = 300;

/** Which card each level comes from, and the crop inside it: x, y, width, height (4:5). */
const PORTRAITS = [
  { id: 'beginner', file: 'cards-beginner-to-hard.png', crop: [8, 40, 256, 320] },
  { id: 'easy', file: 'cards-beginner-to-hard.png', crop: [296, 40, 256, 320] },
  { id: 'medium', file: 'cards-beginner-to-hard.png', crop: [585, 40, 256, 320] },
  { id: 'hard', file: 'cards-beginner-to-hard.png', crop: [874, 40, 256, 320] },
  { id: 'expert', file: 'card-expert.png', crop: [10, 30, 271, 339] },
  { id: 'maximum', file: 'card-maximum.png', crop: [8, 20, 255, 319] },
];

/** Runs in the page: crops and scales one portrait, returning a JPEG data URL. */
async function crop({ data, crop: [x, y, w, h], width, height }) {
  const image = new Image();
  image.src = data;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, w, h, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync(out, { recursive: true });
for (const portrait of PORTRAITS) {
  const bytes = readFileSync(join(sources, portrait.file));
  const url = await page.evaluate(crop, {
    data: `data:image/png;base64,${bytes.toString('base64')}`,
    crop: portrait.crop,
    width: WIDTH,
    height: HEIGHT,
  });
  const jpeg = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(out, `${portrait.id}.jpg`), jpeg);
  console.log(`${portrait.id}.jpg  ${(jpeg.length / 1024).toFixed(1)} KB`);
}
await browser.close();
