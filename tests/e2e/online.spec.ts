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

// Two players in two browser windows, connected from an invitation link over the real network
// (public Nostr relays find the two, then WebRTC connects them directly). These tests need the
// internet, so they are kept out of CI like the visual suite.
//
// The development hook is gone during an online game, so moves are made by clicking where the
// squares are in the top view; a separate page with the hook measures those points first.

import { expect, test, type Browser, type Page } from '@playwright/test';

type Ui = 'modern' | 'retro';
type Point = { x: number; y: number };
type Grid = Record<'w' | 'b', Record<string, Point>>;

const SQUARES = [...'abcdefgh'].flatMap((f) => [...'12345678'].map((r) => `${f}${r}`));
const STATUS: Record<Ui, string> = { modern: '.m-turn-text', retro: '.status-line' };
/** Addresses and connection details that must never reach the console. */
const LEAKS = [
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b(?:[0-9a-f]{1,4}:){3,}[0-9a-f]{0,4}\b/i,
  /candidate:/i,
  /\bv=0\b|a=ice-|a=fingerprint/,
];

test.skip(!!process.env.CI, 'needs the internet: public relays introduce the two players');
// Chromium's own test camera and microphone, allowed without a prompt.
test.use({
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
});
test.describe.configure({ timeout: 180_000 });

/** Counts peer connections and sockets from the first script on, before the game's own code. */
async function countNetwork(page: Page) {
  await page.addInitScript(() => {
    const counts = { peers: 0, sockets: 0, devices: 0 };
    const ask = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (ask) {
      navigator.mediaDevices.getUserMedia = (constraints) => {
        counts.devices++;
        return ask(constraints);
      };
    }
    (window as unknown as { __testNetwork: typeof counts }).__testNetwork = counts;
    const Peer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Peer {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        counts.peers++;
      }
    };
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        counts.sockets++;
      }
    };
  });
}

const network = (page: Page) =>
  page.evaluate(() => {
    const { peers, sockets } = (
      window as unknown as { __testNetwork: { peers: number; sockets: number } }
    ).__testNetwork;
    return { peers, sockets };
  });

/** How many times the page asked for a camera or microphone. */
const deviceRequests = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __testNetwork: { devices: number } }).__testNetwork.devices,
  );

/** Where each square is in the top view, from White's and from Black's side. */
async function measureGrid(browser: Browser, ui: Ui): Promise<Grid> {
  const page = await browser.newPage();
  await page.goto(`/?debug=1&engine=off&anim=0&seed=7&ui=${ui}`);
  await page.waitForFunction(() => window.__chessDebug?.pieceCount() === 32, null, {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__chessDebug.ready);
  const grid = { w: {}, b: {} } as Grid;
  await page.keyboard.press('t');
  for (const side of ['w', 'b'] as const) {
    if (side === 'b') await page.keyboard.press('f');
    await page.waitForTimeout(1500);
    for (const square of SQUARES) {
      const p = await page.evaluate(
        (s) =>
          (
            window as unknown as { __chessDebug: { squareToScreen(s: string): Point } }
          ).__chessDebug.squareToScreen(s),
        square,
      );
      grid[side][square] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  await page.close();
  return grid;
}

async function player(browser: Browser, ui: Ui, url = `/?ui=${ui}&anim=0&engine=off`) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  const logs: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    logs.push(m.text());
    // A public relay that is down or busy is the browser's complaint, not the game's.
    if (m.type() === 'error' && !/^WebSocket connection to 'wss:/.test(m.text()))
      errors.push(m.text());
  });
  await countNetwork(page);
  await page.goto(url);
  return { page, errors, logs, status: page.locator(STATUS[ui]) };
}

async function accept(page: Page, title: string, name: string, button: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  const go = dialog.getByRole('button', { name: button, exact: true });
  const box = dialog.getByRole('checkbox');
  await expect(box).not.toBeChecked();
  await expect(go).toBeDisabled();
  await dialog.getByRole('textbox').fill(name);
  await box.check();
  await expect(go).toBeEnabled();
  await go.click();
}

/** The host asks for an online game as White, 5 minutes, and returns the link. */
async function createLink(page: Page, ui: Ui): Promise<string> {
  await expect(page.locator(STATUS[ui])).toHaveText('Your move.', { timeout: 60_000 });
  await page.keyboard.press('Control+n');
  const sheet = page.getByRole('dialog', { name: 'New Game' });
  if (ui === 'modern') {
    await sheet.getByRole('radio', { name: 'A friend online' }).click();
    await sheet.getByRole('radio', { name: 'White', exact: true }).click();
    await sheet.getByRole('radio', { name: '5 min', exact: true }).click();
  } else {
    await sheet.getByLabel('Opponent').selectOption('online');
    await sheet.getByLabel('You play').selectOption('w');
    await sheet.getByLabel('Time control').selectOption('5');
  }
  await sheet.getByRole('button', { name: 'Create Link' }).click();
  // Nothing may connect while the warning is up.
  await expect(page.getByRole('dialog', { name: 'Play a Friend Online' })).toBeVisible();
  expect(await network(page)).toEqual({ peers: 0, sockets: 0 });
  await accept(page, 'Play a Friend Online', 'Ana', 'Create Link');
  const field = page.getByRole('textbox', { name: 'Game link' });
  await expect(field).toHaveValue(/#play=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  return field.inputValue();
}

async function click(page: Page, grid: Grid, side: 'w' | 'b', from: string, to: string) {
  for (const square of [from, to]) {
    const p = grid[side][square]!;
    await page.mouse.click(p.x, p.y);
  }
}

for (const ui of ['modern', 'retro'] as const) {
  test(`two players connect from a link and play (${ui})`, async ({ browser }) => {
    const grid = await measureGrid(browser, ui);
    const host = await player(browser, ui);
    const link = await createLink(host.page, ui);
    expect(new URL(link).search).toBe(`?ui=${ui}&anim=0&engine=off`);

    const guest = await player(browser, ui, link);
    // The link leaves the address bar at once, and nothing connects before the warning is accepted.
    await expect(guest.page.getByRole('dialog', { name: 'Join an Online Game' })).toBeVisible({
      timeout: 60_000,
    });
    expect(new URL(guest.page.url()).hash).toBe('');
    expect(await network(guest.page)).toEqual({ peers: 0, sockets: 0 });
    await accept(guest.page, 'Join an Online Game', 'Ben', 'Join Game');

    // The invitation closes by itself once the friend has joined.
    await expect(host.page.getByRole('dialog', { name: 'Invite a Friend' })).toHaveCount(0, {
      timeout: 120_000,
    });
    await expect(guest.status).toHaveText('Ana to move.', { timeout: 30_000 });
    await expect(host.status).toHaveText('Your move.');
    expect((await network(guest.page)).peers).toBeGreaterThan(0);
    // The development hook is gone during an online game.
    for (const p of [host.page, guest.page]) {
      expect(await p.evaluate(() => 'cuChessDebug'.replace('cu', '__') in window)).toBe(false);
    }

    await host.page.keyboard.press('t');
    await guest.page.keyboard.press('t');
    await host.page.waitForTimeout(1500);
    await guest.page.waitForTimeout(1500);
    await click(host.page, grid, 'w', 'e2', 'e4');
    await expect(guest.status).toHaveText('Your move.', { timeout: 20_000 });
    await click(guest.page, grid, 'b', 'e7', 'e5');
    await expect(host.status).toHaveText('Your move.', { timeout: 20_000 });
    for (const p of [host.page, guest.page]) {
      await expect(p.locator(ui === 'modern' ? '.m-move-san' : '.move-san').first()).toHaveText(
        'e4',
      );
    }

    // Each side's clock for the other agrees within a second.
    const clocks = async (p: Page) =>
      (await p.locator(ui === 'modern' ? '.m-clock' : '.clock').allTextContents()).map((t) =>
        t.trim(),
      );
    const [h, g] = [await clocks(host.page), await clocks(guest.page)];
    const seconds = (t: string) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
    // Host cards: top Black, bottom White; guest cards: top White, bottom Black.
    expect(Math.abs(seconds(h[0]!) - seconds(g[1]!))).toBeLessThanOrEqual(1);
    expect(Math.abs(seconds(h[1]!) - seconds(g[0]!))).toBeLessThanOrEqual(1);

    // Switching interfaces keeps the game going.
    await host.page.getByRole('radio', { name: ui === 'modern' ? 'Retro' : 'Modern' }).click();
    await expect(host.page.locator(STATUS[ui === 'modern' ? 'retro' : 'modern'])).toHaveText(
      'Your move.',
    );

    // A resignation reaches the other side.
    await guest.page.keyboard.press('Control+n');
    await guest.page
      .getByRole('dialog', { name: 'Leave the online game?' })
      .getByRole('button', { name: 'Leave' })
      .click();
    await expect(host.page.getByRole('dialog', { name: 'Game Over' })).toContainText('You win!', {
      timeout: 20_000,
    });

    for (const side of [host, guest]) {
      expect(side.errors).toEqual([]);
      for (const line of side.logs) {
        for (const leak of LEAKS) expect(line, line).not.toMatch(leak);
      }
    }
  });
}

test.describe('video and voice', () => {
  test('cameras and microphones are off until turned on, and show on the cards', async ({
    browser,
  }) => {
    const host = await player(browser, 'modern');
    const link = await createLink(host.page, 'modern');
    const guest = await player(browser, 'modern', link);
    await accept(guest.page, 'Join an Online Game', 'Ben', 'Join Game');
    await expect(host.page.getByRole('dialog', { name: 'Invite a Friend' })).toHaveCount(0, {
      timeout: 120_000,
    });
    const card = (p: Page, row: 'top' | 'bottom') => p.locator(`#match-card .m-player.${row}`);
    const playing = (video: ReturnType<Page['locator']>) =>
      expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 })
        .toBeGreaterThan(0);

    // Nothing starts by itself.
    expect(await deviceRequests(host.page)).toBe(0);
    expect(await deviceRequests(guest.page)).toBe(0);
    await expect(card(host.page, 'bottom').locator('video')).toBeHidden();

    // Ana turns her camera and microphone on: her own card shows her, mirrored.
    await card(host.page, 'bottom').getByRole('button', { name: 'Turn your camera on' }).click();
    await card(host.page, 'bottom')
      .getByRole('button', { name: 'Turn your microphone on' })
      .click();
    const preview = card(host.page, 'bottom').locator('video.m-avatar-video');
    await playing(preview);
    await expect(preview).toHaveClass(/mirrored/);
    expect(await deviceRequests(host.page)).toBe(2);

    // Ben sees and hears her, and can mute her on his side only.
    const friend = card(guest.page, 'top').locator('video.m-avatar-video');
    await playing(friend);
    await expect(card(guest.page, 'top')).toHaveClass(/video-on/);
    const mute = card(guest.page, 'top').getByRole('button', { name: 'Mute Ana' });
    await expect(mute).toBeVisible({ timeout: 30_000 });
    await mute.click();
    await expect(card(guest.page, 'top').getByRole('button', { name: 'Unmute Ana' })).toBeVisible();
    expect(
      await guest.page.evaluate(
        () => document.querySelector<HTMLAudioElement>('body > audio')?.muted,
      ),
    ).toBe(true);

    // Switching Ben's interface keeps the picture.
    await guest.page.getByRole('radio', { name: 'Retro' }).click();
    await playing(guest.page.locator('.player-card.top video.card-video'));
    await guest.page.getByRole('radio', { name: 'Modern' }).click();

    // Ana turns her microphone and camera off: Ben's card follows the real tracks.
    await card(host.page, 'bottom')
      .getByRole('button', { name: 'Turn your microphone off' })
      .click();
    await expect(
      card(guest.page, 'top').getByRole('img', { name: "Ana's microphone is off" }),
    ).toBeVisible({ timeout: 30_000 });
    await card(host.page, 'bottom').getByRole('button', { name: 'Turn your camera off' }).click();
    await expect(preview).toBeHidden();
    await expect(card(guest.page, 'top').locator('video')).toBeHidden({ timeout: 30_000 });

    // Ben never turned anything on, so nothing of his was ever asked for.
    expect(await deviceRequests(guest.page)).toBe(0);
    for (const side of [host, guest]) expect(side.errors).toEqual([]);
  });
});
