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
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

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
    const connections: RTCPeerConnection[] = [];
    (window as unknown as { __testPeers: typeof connections }).__testPeers = connections;
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
        connections.push(this);
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

/** A player's window; `clockMs` sets its clock that far off the real time, as a drifted device. */
async function player(browser: Browser, ui: Ui, url = `/?ui=${ui}&anim=0&engine=off`, clockMs = 0) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (clockMs) {
    await page.addInitScript((offset) => {
      const now = Date.now.bind(Date);
      Date.now = () => now() + offset;
    }, clockMs);
  }
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

/** The invitation opened with the test's settings (interface, no animation, no engine). */
function withTestSettings(link: string, ui: Ui): string {
  const url = new URL(link);
  return `${url.pathname}?ui=${ui}&anim=0&engine=off${url.hash}`;
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
  const before = await network(page);
  await sheet.getByRole('button', { name: 'Create Link' }).click();
  // Nothing new may connect while the warning is up.
  await expect(page.getByRole('dialog', { name: 'Play a Friend Online' })).toBeVisible();
  expect(await network(page)).toEqual(before);
  await accept(page, 'Play a Friend Online', 'Ana', 'Create Link');
  const field = page.getByRole('textbox', { name: 'Game link' });
  await expect(field).toHaveValue(/^http:\/\/localhost:4173\/#g=[A-Za-z0-9_-]{22}$/);
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
    // The link carries the page and the secret only; the test adds its own settings for the guest.
    expect(new URL(link).search).toBe('');
    const guest = await player(browser, ui, withTestSettings(link, ui));
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

test('players whose clocks are wrong still find each other', async ({ browser }) => {
  // The relays compare the times signals carry. One clock set three hours behind by hand, the
  // other five minutes fast: both must still meet, on the server's clock.
  const host = await player(browser, 'modern', undefined, -3 * 3600_000);
  const link = await createLink(host.page, 'modern');
  const guest = await player(browser, 'modern', withTestSettings(link, 'modern'), 5 * 60_000);
  await accept(guest.page, 'Join an Online Game', 'Ben', 'Join Game');
  await expect(host.page.getByRole('dialog', { name: 'Invite a Friend' })).toHaveCount(0, {
    timeout: 120_000,
  });
  await expect(guest.status).toHaveText('Ana to move.', { timeout: 30_000 });
  for (const side of [host, guest]) expect(side.errors).toEqual([]);
});

test.describe('video and voice', () => {
  test('cameras and microphones are off until turned on, and show on the cards', async ({
    browser,
  }) => {
    const host = await player(browser, 'modern');
    const link = await createLink(host.page, 'modern');
    const guest = await player(browser, 'modern', withTestSettings(link, 'modern'));
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

  test('both players on camera and microphone stay connected', async ({ browser }) => {
    const host = await player(browser, 'modern');
    const link = await createLink(host.page, 'modern');
    const guest = await player(browser, 'modern', withTestSettings(link, 'modern'));
    await accept(guest.page, 'Join an Online Game', 'Ben', 'Join Game');
    await expect(host.page.getByRole('dialog', { name: 'Invite a Friend' })).toHaveCount(0, {
      timeout: 120_000,
    });
    const card = (p: Page, row: 'top' | 'bottom') => p.locator(`#match-card .m-player.${row}`);
    const playing = (video: ReturnType<Page['locator']>) =>
      expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 })
        .toBeGreaterThan(0);
    const away = (p: Page) => p.locator('#match-card .m-note', { hasText: 'Disconnected' });

    /** Neither side shows the other as gone, every second for a while. */
    const holds = async (seconds: number) => {
      for (let second = 0; second < seconds; second++) {
        for (const { page } of [host, guest]) await expect(away(page)).toHaveCount(0);
        await host.page.waitForTimeout(1000);
      }
    };

    // Both turn their camera and microphone on at the same moment: their renegotiations must not
    // collide, or a picture never arrives (or the connection drops).
    await Promise.all(
      [host, guest].map(async ({ page }) => {
        await card(page, 'bottom').getByRole('button', { name: 'Turn your camera on' }).click();
        await card(page, 'bottom').getByRole('button', { name: 'Turn your microphone on' }).click();
      }),
    );
    for (const { page } of [host, guest]) {
      await playing(card(page, 'bottom').locator('video.m-avatar-video'));
      await playing(card(page, 'top').locator('video.m-avatar-video'));
    }
    await holds(10);

    // Ana's connection drops. On the new one both send their camera and microphone again at once,
    // and both pictures must come back.
    await host.page.evaluate(() =>
      (window as unknown as { __testPeers: RTCPeerConnection[] }).__testPeers.forEach((p) =>
        p.close(),
      ),
    );
    await expect(away(guest.page)).toHaveCount(1, { timeout: 30_000 });
    for (const { page } of [host, guest]) {
      await expect(away(page)).toHaveCount(0, { timeout: 90_000 });
    }
    for (const { page } of [host, guest]) {
      await playing(card(page, 'top').locator('video.m-avatar-video'));
    }
    await holds(20);

    for (const side of [host, guest]) {
      expect(side.logs.filter((l) => /disconnecting peer|peer error/i.test(l))).toEqual([]);
      expect(side.errors).toEqual([]);
    }
  });
});

/** RGBA pixels resampled smoothly to a fraction of their size, as a camera further away sees them. */
function shrink(data: Uint8ClampedArray, w: number, h: number, factor: number) {
  const W = Math.round(w * factor);
  const H = Math.round(h * factor);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1.001, (x + 0.5) / factor - 0.5);
      const sy = Math.min(h - 1.001, (y + 0.5) / factor - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const at = (dx: number, dy: number) => data[((y0 + dy) * w + x0 + dx) * 4 + c]!;
        out[(y * W + x) * 4 + c] =
          at(0, 0) * (1 - fx) * (1 - fy) +
          at(1, 0) * fx * (1 - fy) +
          at(0, 1) * (1 - fx) * fy +
          at(1, 1) * fx * fy;
      }
    }
  return { data: out, width: W, height: H };
}

/** A 3x3 box blur, as a slightly unfocused camera would see the code. */
function blur(data: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx;
            const Y = y + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
            sum += data[(Y * w + X) * 4 + c]!;
            n++;
          }
        out[(y * w + x) * 4 + c] = sum / n;
      }
  return { data: out, width: w, height: h };
}

test('on a phone the online dialogs wait for a tap, stay open on a tap beside them and keep the link inside', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/?ui=modern&anim=0&engine=off');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  /**
   * No field is focused (no keyboard, no zoom), every field's text is at least 16px, and a stray
   * tap beside the dialog leaves it open.
   */
  const calm = async (title: string) => {
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    if (touch) {
      await expect(dialog).toBeFocused();
      for (const field of await dialog.getByRole('textbox').all()) {
        const size = await field.evaluate((f) => parseFloat(getComputedStyle(f).fontSize));
        expect(size).toBeGreaterThanOrEqual(16);
      }
    }
    await page.touchscreen.tap(8, 8);
    await expect(dialog).toBeVisible();
  };

  // createLink, with the checks on the way.
  await expect(page.locator(STATUS.modern)).toHaveText('Your move.', { timeout: 60_000 });
  for (const name of ['Ana', 'Ana']) {
    await page.keyboard.press('Control+n');
    const sheet = page.getByRole('dialog', { name: 'New Game' });
    await sheet.getByRole('radio', { name: 'A friend online' }).click();
    await sheet.getByRole('button', { name: 'Create Link' }).click();
    await calm('Play a Friend Online');
    await accept(page, 'Play a Friend Online', name, 'Create Link');
    await calm('Invite a Friend');
    const invite = page.getByRole('dialog', { name: 'Invite a Friend' });
    const box = (await invite.boundingBox())!;
    const row = (await invite.locator('.online-link').boundingBox())!;
    const field = (await invite.getByRole('textbox', { name: 'Game link' }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(row.x + row.width).toBeLessThanOrEqual(box.x + box.width);
    expect(field.x + field.width).toBeLessThanOrEqual(row.x + row.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await invite.getByRole('button', { name: 'Cancel' }).click();
  }
  await context.close();
});

test('every invitation shows its own QR code, which scans reliably to its own link', async ({
  browser,
}) => {
  const host = await player(browser, 'modern');
  const dialog = host.page.getByRole('dialog', { name: 'Invite a Friend' });
  /** Reads the code as drawn on screen: as shown, at 60% and blurred; each must give the link. */
  const scan = async () => {
    // Let the dialog finish appearing before taking its picture.
    await dialog.evaluate((d) =>
      Promise.all(d.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
    const png = PNG.sync.read(await host.page.locator('.online-qr-code').screenshot());
    const shown = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
    const results: Array<string | null> = [];
    for (const image of [
      shown,
      shrink(shown.data, shown.width, shown.height, 0.6),
      blur(shown.data, shown.width, shown.height),
    ]) {
      const started = performance.now();
      results.push(jsQR(image.data, image.width, image.height)?.data ?? null);
      expect(performance.now() - started, 'decoding time in ms').toBeLessThan(500);
    }
    return results;
  };

  const first = await createLink(host.page, 'modern');
  await expect(host.page.getByRole('img', { name: 'QR code of the game link' })).toBeVisible();
  expect(await scan()).toEqual([first, first, first]);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const second = await createLink(host.page, 'modern');
  expect(second).not.toBe(first);
  expect(await scan()).toEqual([second, second, second]);
  expect(host.errors).toEqual([]);
});
