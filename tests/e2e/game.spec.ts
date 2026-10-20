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

import { expect, test, type Page } from '@playwright/test';

type Debug = {
  ready: Promise<void>;
  fen(): string;
  phase(): string;
  history(): string[];
  pieceCount(): number;
  consistency(): string[];
  whenIdle(): Promise<void>;
  clickPoint(square: string): { x: number; y: number } | null;
  newGame(patch: Record<string, unknown>, fen?: string): Promise<void>;
  setSettings(patch: Record<string, unknown>): void;
  state(): { difficulty: string; status: { kind: string; winner?: string }; turn: string };
  cameraPosition(): number[];
  effectCount(): number;
};

declare global {
  interface Window {
    __chessDebug: Debug;
  }
}

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?debug=1&seed=7${query}`);
  await page.waitForFunction(() => window.__chessDebug?.pieceCount() === 32, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__chessDebug.ready);
  return errors;
}

async function point(page: Page, square: string) {
  const p = await page.evaluate((s) => window.__chessDebug.clickPoint(s), square);
  if (!p) throw new Error(`no visible point for ${square}`);
  return p;
}

async function clickSquare(page: Page, square: string) {
  const p = await point(page, square);
  await page.mouse.click(p.x, p.y);
}

async function move(page: Page, from: string, to: string) {
  await clickSquare(page, from);
  await clickSquare(page, to);
}

const idle = (page: Page) => page.evaluate(() => window.__chessDebug.whenIdle());
const history = (page: Page) => page.evaluate(() => window.__chessDebug.history());
const consistency = (page: Page) => page.evaluate(() => window.__chessDebug.consistency());

async function newGame(page: Page, patch: Record<string, unknown>, fen?: string) {
  await page.evaluate(
    ([p, f]) => window.__chessDebug.newGame(p as Record<string, unknown>, f as string | undefined),
    [patch, fen] as const,
  );
  await idle(page);
}

test('boots with the board, 32 pieces, the menus and no errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('menubar')).toBeVisible();
  for (const name of [
    'File',
    'Edit',
    'Game',
    'Actions',
    'Mentor',
    'Preferences',
    'Windows',
    'Help',
  ]) {
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  }
  await expect(page.locator('#game-status')).toBeVisible();
  expect(await page.evaluate(() => window.__chessDebug.pieceCount())).toBe(32);
  expect(await consistency(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('plays a move by clicking and Stockfish answers with a legal move', async ({ page }) => {
  await open(page, '&difficulty=beginner');
  await newGame(page, { mode: 'computer', humanColor: 'w', difficulty: 'beginner', minutes: 0 });
  await move(page, 'e2', 'e4');
  await expect.poll(() => history(page), { timeout: 30_000 }).toHaveLength(2);
  await idle(page);
  expect((await history(page))[0]).toBe('e4');
  expect(await consistency(page)).toEqual([]);
});

test('plays a move by dragging and refuses an illegal one', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'local', minutes: 0 });
  const before = await page.evaluate(() => window.__chessDebug.fen());
  await move(page, 'e2', 'e5');
  await idle(page);
  expect(await page.evaluate(() => window.__chessDebug.fen())).toBe(before);

  const from = await point(page, 'g1');
  const to = await point(page, 'f3');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y - 25, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => history(page)).toEqual(['Nf3']);
  await idle(page);
  expect(await consistency(page)).toEqual([]);
});

test('promotes through the promotion dialog', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'local', minutes: 0 }, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  await move(page, 'a7', 'a8');
  await expect(page.getByRole('dialog', { name: 'Promote pawn to' })).toBeVisible();
  await page.keyboard.press('n');
  await expect.poll(() => history(page)).toEqual(['a8=N']);
  await idle(page);
  expect(await consistency(page)).toEqual([]);
});

test('castles and captures en passant on the board', async ({ page }) => {
  await open(page);
  await newGame(
    page,
    { mode: 'local', minutes: 0, followPath: true },
    'r3k2r/pppppppp/8/4P3/8/8/PPPP1PPP/R3K2R b KQkq - 0 1',
  );
  await move(page, 'd7', 'd5');
  await idle(page);
  await move(page, 'e5', 'd6');
  await idle(page);
  await move(page, 'e8', 'c8');
  await idle(page);
  await move(page, 'e1', 'g1');
  await idle(page);
  expect(await history(page)).toEqual(['d5', 'exd6', 'O-O-O', 'O-O']);
  expect(await consistency(page)).toEqual([]);
});

test('takes back a move while the engine is thinking', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'computer', humanColor: 'w', difficulty: 'maximum', minutes: 0 });
  await move(page, 'd2', 'd4');
  await expect.poll(() => page.evaluate(() => window.__chessDebug.phase())).toBe('engineThinking');
  await page.keyboard.press('Control+z');
  await idle(page);
  await page.waitForTimeout(3500);
  expect(await history(page)).toEqual([]);
  expect(await page.evaluate(() => window.__chessDebug.phase())).toBe('playerTurn');
  expect(await consistency(page)).toEqual([]);
});

test('starts a new game while the engine is thinking', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'computer', humanColor: 'w', difficulty: 'maximum', minutes: 0 });
  await move(page, 'e2', 'e4');
  await expect.poll(() => page.evaluate(() => window.__chessDebug.phase())).toBe('engineThinking');
  await newGame(page, { mode: 'computer', humanColor: 'w', difficulty: 'easy', minutes: 0 });
  await page.waitForTimeout(3000);
  expect(await history(page)).toEqual([]);
  expect(await consistency(page)).toEqual([]);
});

test('the computer opens when the player takes Black, and the board turns round', async ({
  page,
}) => {
  await open(page);
  const whiteSide = await page.evaluate(() => window.__chessDebug.cameraPosition());
  await newGame(page, { mode: 'computer', humanColor: 'b', difficulty: 'beginner', minutes: 0 });
  await expect.poll(() => history(page), { timeout: 30_000 }).toHaveLength(1);
  await page.waitForTimeout(1500);
  const blackSide = await page.evaluate(() => window.__chessDebug.cameraPosition());
  expect(Math.sign(blackSide[2]!)).toBe(-Math.sign(whiteSide[2]!));
});

test('the menus work with the keyboard', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Alt+g');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Game' }).click();
  await page.locator('.menu-entry', { hasText: 'Difficulty' }).hover();
  await page.locator('.submenu .menu-entry', { hasText: 'Expert' }).click();
  expect(await page.evaluate(() => window.__chessDebug.state().difficulty)).toBe('expert');
});

test('exports a game as PGN and loads it back', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'local', minutes: 0 });
  for (const [a, b] of [
    ['e2', 'e4'],
    ['c7', 'c5'],
    ['g1', 'f3'],
  ]) {
    await move(page, a!, b!);
    await idle(page);
  }
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.locator('.menu-entry', { hasText: 'Export' }).click();
  const pgn = await page.locator('.dialog textarea').inputValue();
  expect(pgn).toContain('1. e4 c5 2. Nf3');
  await page.keyboard.press('Escape');
  await newGame(page, { mode: 'local', minutes: 0 });
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.locator('.menu-entry', { hasText: 'Open Game or Position' }).click();
  await page.locator('.dialog textarea').fill(pgn);
  await page.getByRole('button', { name: 'Load' }).click();
  await expect.poll(() => history(page)).toEqual(['e4', 'c5', 'Nf3']);
  await idle(page);
  expect(await consistency(page)).toEqual([]);
});

test('checkmate ends the game with the Game Over dialog', async ({ page }) => {
  await open(page);
  await newGame(page, { mode: 'local', minutes: 0 });
  for (const [a, b] of [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ]) {
    await move(page, a!, b!);
    await idle(page);
  }
  await expect(page.getByRole('dialog', { name: 'Game Over' })).toBeVisible();
  await expect(page.locator('.status-line')).toHaveText('White is checkmated. Black wins.');
});

test('rotates, tilts, zooms and resets the camera like the original', async ({ page }) => {
  await open(page);
  const start = await page.evaluate(() => window.__chessDebug.cameraPosition());
  // Drag the near-left corner of the frame: rotate and tilt.
  const p = await page.evaluate(() => {
    const d = window.__chessDebug as unknown as {
      worldToScreen(x: number, y: number, z: number): { x: number; y: number };
    };
    return d.worldToScreen(-4.35, 0.01, 4.35);
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 160, p.y - 40, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const rotated = await page.evaluate(() => window.__chessDebug.cameraPosition());
  expect(Math.abs(rotated[0]! - start[0]!)).toBeGreaterThan(1);

  await page.mouse.move(587, 440);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(800);
  const zoomed = await page.evaluate(() => window.__chessDebug.cameraPosition());
  expect(Math.hypot(...zoomed)).toBeLessThan(Math.hypot(...rotated));

  await page.keyboard.press('Home');
  await page.waitForTimeout(1200);
  const reset = await page.evaluate(() => window.__chessDebug.cameraPosition());
  reset.forEach((v, i) => expect(v).toBeCloseTo(start[i]!, 1));
});

test('Follow move path and Demolish captures: the knight takes its L and the victim shatters', async ({
  page,
}) => {
  const errors = await open(page);
  await newGame(
    page,
    { mode: 'local', minutes: 0, followPath: true, demolish: true },
    '4k3/8/8/8/8/5p2/6P1/4K1N1 w - - 0 1',
  );
  await page.waitForTimeout(1500); // fragments load in the background
  await move(page, 'g1', 'f3');
  await expect
    .poll(() => page.evaluate(() => window.__chessDebug.effectCount()), { timeout: 5000 })
    .toBeGreaterThan(0);
  await idle(page);
  await expect
    .poll(() => page.evaluate(() => window.__chessDebug.effectCount()), { timeout: 5000 })
    .toBe(0);
  expect(await history(page)).toEqual(['Nxf3']);
  expect(await consistency(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('works on a phone-sized screen with touch', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await open(page);
  await newGame(page, { mode: 'local', minutes: 0 });
  const a = await point(page, 'e2');
  await page.touchscreen.tap(a.x, a.y);
  const b = await point(page, 'e4');
  await page.touchscreen.tap(b.x, b.y);
  await expect.poll(() => history(page)).toEqual(['e4']);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await context.close();
});
