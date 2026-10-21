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

/**
 * Opens the game in the given interface; most tests drive the retro one's menus and panels, and
 * null opens whatever the saved settings (or the default) choose.
 */
async function open(
  page: Page,
  query = '',
  ui: 'retro' | 'modern' | null = 'retro',
): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?debug=1&seed=7${ui ? `&ui=${ui}` : ''}${query}`);
  await ready(page);
  return errors;
}

async function ready(page: Page) {
  await page.waitForFunction(() => window.__chessDebug?.pieceCount() === 32, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__chessDebug.ready);
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
  // The camera eases home; with software rendering that can take a few seconds.
  await expect
    .poll(async () => {
      const now = await page.evaluate(() => window.__chessDebug.cameraPosition());
      return Math.max(...now.map((v, i) => Math.abs(v - start[i]!)));
    })
    .toBeLessThan(0.02);
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

test('Glass Studio: glass board and pieces, glass shards, and the reflections switch', async ({
  page,
}) => {
  const errors = await open(page);
  const theme = () =>
    page.evaluate(
      () =>
        (window.__chessDebug as unknown as { theme(): Record<string, unknown> }).theme() as {
          board: string;
          pieces: string;
          table: string;
          whiteMaterial: { transmission?: number } | null;
          mirror: boolean | null;
        },
    );
  await newGame(page, { mode: 'local', minutes: 0, demolish: true });
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry .menu-label', { hasText: /^Looks$/ }).hover();
  await page.locator('.submenu .menu-entry', { hasText: 'Glass Studio' }).click();
  const glass = await theme();
  expect(glass).toMatchObject({ board: 'glass', pieces: 'glass', table: 'white-studio' });
  expect(glass.whiteMaterial!.transmission).toBe(1);
  expect(glass.mirror).toBe(true);

  // A glass capture with Demolish bursts into shards that are all freed again.
  await page.waitForTimeout(1500); // fragments load in the background
  await move(page, 'e2', 'e4');
  await idle(page);
  await move(page, 'd7', 'd5');
  await idle(page);
  await move(page, 'e4', 'd5');
  await expect
    .poll(() => page.evaluate(() => window.__chessDebug.effectCount()), { timeout: 5000 })
    .toBeGreaterThan(0);
  await idle(page);
  // Software rendering draws glass at about one frame a second, and the shards live for two
  // seconds of animation time (at most 0.1 s per frame), so allow for that.
  await expect
    .poll(() => page.evaluate(() => window.__chessDebug.effectCount()), { timeout: 40_000 })
    .toBe(0);
  expect(await consistency(page)).toEqual([]);

  // The switch swaps between real and cheaper glass at once, both ways. On a slow renderer the
  // automatic fallback may already have turned reflections off, so start from whatever is set.
  const toggle = async () => {
    await page.getByRole('menuitem', { name: 'Preferences' }).click();
    await page.locator('.menu-entry', { hasText: 'Glass Reflections' }).click();
  };
  const start = (await theme()).mirror!;
  await toggle();
  const flipped = await theme();
  expect(flipped.mirror).toBe(!start);
  expect(flipped.whiteMaterial!.transmission).toBe(start ? 0 : 1);
  await toggle();
  expect((await theme()).mirror).toBe(start);

  expect(await history(page)).toEqual(['e4', 'd5', 'exd5']);
  expect(errors).toEqual([]);
});

test('plays a computer at a custom rating chosen with the slider', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('Control+n');
  const dialog = page.locator('.dialog');
  await expect(dialog.locator('.rating-field')).toBeHidden();
  await dialog.locator('select').nth(2).selectOption('custom');
  await expect(dialog.locator('.rating-field')).toBeVisible();
  await dialog.locator('.rating-field input[type=range]').evaluate((el: HTMLInputElement) => {
    el.value = '800';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(dialog.locator('.rating-field > span')).toHaveText(
    'Rating 800 (between Beginner and Easy)',
  );
  await dialog.locator('select').nth(1).selectOption('b');
  await dialog.getByRole('button', { name: 'Start Game' }).click();
  // The computer plays White's first move at the chosen strength.
  await expect.poll(() => history(page), { timeout: 30_000 }).toHaveLength(1);
  await idle(page);
  await expect(page.locator('#game-status')).toContainText('Stockfish (800)');
  expect(await consistency(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('looks straight down from the top view and back', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, { mode: 'local', minutes: 0 });
  const top = () =>
    page.evaluate(
      () =>
        (window.__chessDebug as unknown as { app: { camera: { isTopView: boolean } } }).app.camera
          .isTopView,
    );
  await page.getByRole('menuitem', { name: 'Actions' }).click();
  await page.locator('.menu-entry', { hasText: 'Top View' }).click();
  expect(await top()).toBe(true);
  await page.waitForTimeout(1500);
  // Moves still work by clicking from above.
  await move(page, 'e2', 'e4');
  await idle(page);
  expect(await history(page)).toEqual(['e4']);
  // Flipping keeps the top view; T toggles back to the normal view.
  await page.keyboard.press('f');
  expect(await top()).toBe(true);
  await page.keyboard.press('t');
  expect(await top()).toBe(false);
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

test('switches board, piece and table looks from the menu and the dialog', async ({ page }) => {
  const errors = await open(page);
  const theme = () =>
    page.evaluate(
      () =>
        (window.__chessDebug as unknown as { theme(): Record<string, unknown> }).theme() as {
          board: string;
          pieces: string;
          table: string;
          whiteMaterial: { metalness: number } | null;
        },
    );
  await newGame(page, { mode: 'local', minutes: 0 });
  await move(page, 'e2', 'e4');
  await idle(page);

  // Quick submenu.
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry .menu-label', { hasText: /^Board$/ }).hover();
  await page.locator('.submenu .menu-entry', { hasText: 'Mahogany' }).click();
  expect((await theme()).board).toBe('mahogany');

  // One-click look from the menu sets all three.
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry .menu-label', { hasText: /^Looks$/ }).hover();
  await page.locator('.submenu .menu-entry', { hasText: 'Glass Studio' }).click();
  expect(await theme()).toMatchObject({ board: 'glass', pieces: 'glass', table: 'white-studio' });

  // Dialog: pick presets in every tab and keep them.
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry', { hasText: 'Board and Pieces' }).click();
  await page.locator('[data-pane=board] .swatch[data-theme=marble]').click();
  await page.locator('.tab[data-tab=pieces]').click();
  await page.locator('[data-pane=pieces] .swatch[data-theme=lacquer-silver]').click();
  await page.locator('.tab[data-tab=table]').click();
  await page.locator('[data-pane=table] .swatch[data-theme=blue-stone]').click();
  await page.getByRole('button', { name: 'OK' }).click();
  const kept = await theme();
  expect(kept).toMatchObject({ board: 'marble', pieces: 'lacquer-silver', table: 'blue-stone' });
  expect(kept.whiteMaterial!.metalness).toBeGreaterThan(0.3);

  // Cancel puts the previous look back.
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry', { hasText: 'Board and Pieces' }).click();
  await page.locator('.tab[data-tab=pieces]').click();
  await page.locator('[data-pane=pieces] .swatch[data-theme=gold-silver]').click();
  expect((await theme()).pieces).toBe('gold-silver');
  await page.keyboard.press('Escape');
  expect((await theme()).pieces).toBe('lacquer-silver');

  // A custom colour switches that category to Custom.
  await page.getByRole('menuitem', { name: 'Preferences' }).click();
  await page.locator('.menu-entry', { hasText: 'Board and Pieces' }).click();
  await page
    .locator('[data-pane=board] input[data-custom=dark]')
    .evaluate((el: HTMLInputElement) => {
      el.value = '#2a5d8f';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.getByRole('button', { name: 'OK' }).click();
  expect((await theme()).board).toBe('custom');

  // The game is untouched and the choices survive a reload.
  expect(await history(page)).toEqual(['e4']);
  expect(await consistency(page)).toEqual([]);
  await page.reload();
  await page.waitForFunction(() => window.__chessDebug?.pieceCount() === 32, null, {
    timeout: 60_000,
  });
  expect(await theme()).toMatchObject({
    board: 'custom',
    pieces: 'lacquer-silver',
    table: 'blue-stone',
  });
  expect(errors).toEqual([]);
});

test.describe('modern interface', () => {
  const dock = (page: Page) => page.getByRole('toolbar', { name: 'Game controls' });
  const uiStyle = (page: Page) => page.evaluate(() => document.documentElement.dataset.ui);
  const zones = (page: Page) =>
    page.evaluate(
      () =>
        (
          window.__chessDebug as unknown as {
            app: { highlights: { state: { zones?: string[] } } };
          }
        ).app.highlights.state.zones?.length ?? 0,
    );

  test('is the interface a new player gets, and boots without errors', async ({ page }) => {
    const errors = await open(page, '', null);
    expect(await uiStyle(page)).toBe('modern');
    for (const name of ['Game', 'View', 'Look', 'Options', 'Help']) {
      await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    await expect(page.locator('#match-card')).toBeVisible();
    await expect(page.locator('#coach-card')).toBeVisible();
    await expect(dock(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Modern' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('.title-bar')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('follows a game against Stockfish in the Match card, the dock and the coach', async ({
    page,
  }) => {
    const errors = await open(page, '&difficulty=beginner', 'modern');
    await newGame(page, { mode: 'computer', humanColor: 'w', difficulty: 'beginner', minutes: 5 });
    const status = dock(page).getByRole('status');
    await expect(status).toHaveText('Your move.');
    await move(page, 'e2', 'e4');
    await expect.poll(() => history(page), { timeout: 30_000 }).toHaveLength(2);
    await idle(page);
    const card = page.locator('#match-card');
    await expect(card.locator('.m-move-san').first()).toHaveText('e4');
    await expect(card.locator('.m-move-san.current')).toHaveText((await history(page))[1]!);
    await expect(card.locator('.m-player.top .m-name')).toHaveText('Stockfish');
    await expect(card.locator('.m-player.bottom .m-name')).toHaveText('Player');
    await expect(card.locator('.m-player.bottom .m-clock')).toHaveClass(/active/);
    await expect(status).toHaveText('Your move.');
    await expect(page.locator('#coach-card .m-feed')).toContainText('You played e4');
    expect(await consistency(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('switches to retro and back from the top bar and remembers the choice', async ({ page }) => {
    const errors = await open(page, '&engine=off', null);
    await newGame(page, { mode: 'local', minutes: 0 });
    await move(page, 'e2', 'e4');
    await idle(page);

    await page.getByRole('radio', { name: 'Retro' }).click();
    expect(await uiStyle(page)).toBe('retro');
    await expect(page.locator('#game-status')).toBeVisible();
    await expect(page.locator('#match-card')).toHaveCount(0);
    // The game and the coach's remarks carry over.
    await expect(page.locator('.move-list')).toContainText('e4');
    await expect(page.locator('.coach-log')).toContainText('e4');

    await page.reload();
    await ready(page);
    expect(await uiStyle(page)).toBe('retro');

    await page.getByRole('menuitem', { name: 'Preferences' }).click();
    await page.locator('.menu-entry .menu-label', { hasText: /^Interface$/ }).hover();
    await page.locator('.submenu .menu-entry', { hasText: 'Modern' }).click();
    await expect(page.locator('#match-card')).toBeVisible();
    await expect(page.locator('.title-bar')).toHaveCount(0);
    await page.reload();
    await ready(page);
    expect(await uiStyle(page)).toBe('modern');
    expect(errors).toEqual([]);
  });

  test('starts a game from the New Game sheet', async ({ page }) => {
    const errors = await open(page, '', 'modern');
    await page.getByRole('button', { name: 'New game (Ctrl+N)' }).click();
    const sheet = page.getByRole('dialog', { name: 'New Game' });
    // The compact grid shows every opponent at once.
    await sheet.getByRole('radio', { name: 'Compact' }).click();
    await sheet
      .locator('.m-levels')
      .getByRole('radio', { name: /^Expert/ })
      .click();
    await sheet.getByRole('radio', { name: 'Black', exact: true }).click();
    await sheet.getByRole('radio', { name: '5 min', exact: true }).click();
    await sheet.getByRole('button', { name: 'Start Game' }).click();
    await expect(sheet).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const s = window.__chessDebug.state() as unknown as Record<string, unknown>;
        return { difficulty: s.difficulty, humanColor: s.humanColor, minutes: s.minutes };
      }),
    ).toEqual({ difficulty: 'expert', humanColor: 'b', minutes: 5 });
    // The computer opens as White, and the cards turn round with the board.
    await expect.poll(() => history(page), { timeout: 30_000 }).toHaveLength(1);
    const card = page.locator('#match-card');
    await expect(card.locator('.m-player.bottom .m-name')).toHaveText('Player');
    await expect(card.locator('.m-player.top .m-rating')).toHaveText('2400');
    expect(errors).toEqual([]);
  });

  test('picks the opponent from the endless slider, and remembers the chosen view', async ({
    page,
  }) => {
    const errors = await open(page, '&engine=off', 'modern');
    await page.getByRole('button', { name: 'New game (Ctrl+N)' }).click();
    const sheet = page.getByRole('dialog', { name: 'New Game' });
    const slider = sheet.locator('.m-carousel');
    const centre = slider.locator('.m-carousel-card[data-pos="center"]');
    const name = () => centre.locator('.m-level-name').textContent();
    // The slider is the default view, with three cards in sight: the chosen one in the middle.
    await expect(sheet.getByRole('radio', { name: 'Slider' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sheet.locator('.m-levels')).toBeHidden();
    await expect(slider.getByRole('radio')).toHaveCount(3);
    await expect(centre).toHaveAttribute('aria-checked', 'true');
    expect(await name()).toBe('Easy');

    // The arrows go round without end: six steps on from Easy, past Custom, is Beginner.
    const next = sheet.getByRole('button', { name: 'Next opponent' });
    for (let i = 0; i < 6; i++) await next.click();
    expect(await name()).toBe('Beginner');
    await sheet.getByRole('button', { name: 'Previous opponent' }).click();
    expect(await name()).toBe('Custom');
    await expect(sheet.locator('.rating-field')).toBeVisible();

    // A click on a neighbour brings it to the middle; so do the arrow keys.
    await slider.getByRole('radio', { name: /^Maximum Strength/ }).click();
    expect(await name()).toBe('Maximum Strength');
    await centre.focus();
    await page.keyboard.press('ArrowLeft');
    expect(await name()).toBe('Expert');
    await expect(centre).toBeFocused();

    // The compact grid shows the same choice, and the view is remembered.
    await sheet.getByRole('radio', { name: 'Compact' }).click();
    await expect(slider).toBeHidden();
    await expect(
      sheet.locator('.m-levels').getByRole('radio', { name: /^Expert/ }),
    ).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: 'Start Game' }).click();
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => window.__chessDebug.state().difficulty)).toBe('expert');
    await page.getByRole('button', { name: 'New game (Ctrl+N)' }).click();
    await expect(sheet.getByRole('radio', { name: 'Compact' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sheet.locator('.m-levels')).toBeVisible();
    await sheet.getByRole('radio', { name: 'Slider' }).click();
    expect(await name()).toBe('Expert');
    expect(errors).toEqual([]);
  });

  test('asks before resigning, and a stray Enter keeps the game', async ({ page }) => {
    const errors = await open(page, '&engine=off', 'modern');
    const resign = dock(page).getByRole('button', { name: 'Resign' });
    const ask = page.getByRole('dialog', { name: 'Resign this game?' });
    await resign.click();
    await expect(ask).toContainText('Stockfish wins the game.');
    await page.keyboard.press('Enter');
    await expect(ask).toHaveCount(0);
    expect((await page.evaluate(() => window.__chessDebug.state())).status.kind).toBe('playing');

    await resign.click();
    await ask.getByRole('button', { name: 'Resign' }).click();
    await expect
      .poll(() => page.evaluate(() => window.__chessDebug.state().status))
      .toEqual({ kind: 'resigned', winner: 'b' });
    await expect(page.getByRole('dialog', { name: 'Game Over' })).toBeVisible();
    await expect(dock(page).getByRole('status')).toHaveText('White resigns. Black wins.');
    expect(errors).toEqual([]);
  });

  test('changes the look from the Look menu and keeps the coach aids across a switch', async ({
    page,
  }) => {
    const errors = await open(page, '&engine=off', 'modern');
    await page.getByRole('menuitem', { name: 'Look' }).click();
    await page.locator('.menu-entry .menu-label', { hasText: /^Looks$/ }).hover();
    await page.locator('.submenu .menu-entry', { hasText: 'Console Mahogany' }).click();
    expect(
      await page.evaluate(
        () =>
          (window.__chessDebug as unknown as { theme(): { board: string; table: string } }).theme()
            .board,
      ),
    ).toBe('mahogany');

    await page.locator('#coach-card .m-coach-head').click();
    await page.getByRole('radio', { name: 'Coverage' }).click();
    const covered = await zones(page);
    expect(covered).toBeGreaterThan(0);

    await page.getByRole('radio', { name: 'Retro' }).click();
    await expect(page.locator('input[name=coach-board][value=coverage]')).toBeChecked();
    expect(await zones(page)).toBe(covered);
    expect(errors).toEqual([]);
  });

  test('the menus work with the keyboard and hold back the board shortcuts', async ({ page }) => {
    await open(page, '&engine=off', 'modern');
    const topView = () =>
      page.evaluate(
        () =>
          (window.__chessDebug as unknown as { app: { camera: { isTopView: boolean } } }).app.camera
            .isTopView,
      );
    await page.keyboard.press('Alt+v');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('t');
    expect(await topView()).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('t');
    expect(await topView()).toBe(true);
    await expect(dock(page).getByRole('button', { name: 'Top view (T)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('works on a phone-sized screen with touch', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 780 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await open(page, '&engine=off', 'modern');
    await newGame(page, { mode: 'local', minutes: 0 });
    const a = await point(page, 'e2');
    await page.touchscreen.tap(a.x, a.y);
    const b = await point(page, 'e4');
    await page.touchscreen.tap(b.x, b.y);
    await expect.poll(() => history(page)).toEqual(['e4']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const box = (await dock(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(780);

    // The players sit side by side across the top, the opponent on the left, the coach below.
    const card = (await page.locator('#match-card').boundingBox())!;
    const opponent = (await page.locator('#match-card .m-player.top').boundingBox())!;
    const player = (await page.locator('#match-card .m-player.bottom').boundingBox())!;
    const coach = (await page.locator('#coach-card .m-coach-head').boundingBox())!;
    expect(card.width).toBeGreaterThan(350);
    expect(Math.abs(opponent.y - player.y)).toBeLessThan(1);
    expect(opponent.x + opponent.width).toBeLessThanOrEqual(player.x + 1);
    expect(coach.y).toBeGreaterThanOrEqual(card.y + card.height);
    // The board is framed in the space between the cards and the dock.
    for (const square of ['a1', 'h1', 'a8', 'h8']) {
      const p = await page.evaluate(
        (s) =>
          (
            window.__chessDebug as unknown as {
              squareToScreen(s: string): { x: number; y: number };
            }
          ).squareToScreen(s),
        square,
      );
      expect(p.y).toBeGreaterThan(coach.y + coach.height);
      expect(p.y).toBeLessThan(box.y);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(390);
    }
    await context.close();
  });

  test('a two-finger twist turns the board with the fingers, or against them if set', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 780 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await open(page, '&engine=off', 'modern');
    const touch = await context.newCDPSession(page);
    const x = async () => (await page.evaluate(() => window.__chessDebug.cameraPosition()))[0]!;
    // Two fingers side by side on the empty middle of the board, the second one on the left, so
    // the line between them starts at half a turn and the twist crosses the jump in atan2.
    const centre = await page.evaluate(() =>
      (
        window.__chessDebug as unknown as {
          worldToScreen(x: number, y: number, z: number): { x: number; y: number };
        }
      ).worldToScreen(0, 0.01, 0),
    );
    const fingers = (turn: number) => {
      const dx = 40 * Math.cos(turn);
      const dy = 40 * Math.sin(turn);
      return [
        { x: centre.x + dx, y: centre.y + dy, id: 0 },
        { x: centre.x - dx, y: centre.y - dy, id: 1 },
      ];
    };
    /** Turns the fingers clockwise on the screen (y points down) by `degrees`. */
    const twist = async (degrees: number) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0) });
      for (let step = 1; step <= 8; step++) {
        const turn = ((degrees * Math.PI) / 180) * (step / 8);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: fingers(turn),
        });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    expect(Math.abs(await x())).toBeLessThan(0.02);
    // A clockwise twist turns the board clockwise: the camera swings round to White's right.
    await twist(40);
    await expect.poll(x).toBeGreaterThan(5);

    await page.evaluate(() => window.__chessDebug.setSettings({ reverseTwist: true }));
    await page.keyboard.press('Home');
    await expect.poll(async () => Math.abs(await x())).toBeLessThan(0.02);
    await twist(40);
    await expect.poll(x).toBeLessThan(-5);
    expect(await history(page)).toEqual([]);
    await context.close();
  });
});
