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

// One player's device for online session tests: a controller with stand-in board, sound and
// engine, the session's view of it, and timers the test runs by hand.

import { GameController } from '../../src/game/GameController.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/Settings.ts';
import type { Color } from '../../src/game/types.ts';
import type {
  SavedSession,
  SessionGame,
  SessionStorage,
  Timers,
} from '../../src/net/OnlineSession.ts';
import { createInvite } from '../../src/net/protocol.ts';
import { FakeEngine, FakeSound, FakeUi, FakeView } from './fakes.ts';

export const invite = createInvite();

/** Timers that run only when the test says time has passed. */
export class ManualTimers implements Timers {
  private now = 0;
  private next = 1;
  private readonly pending = new Map<number, { at: number; every: number; run: () => void }>();

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, every: 0, run: callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  setInterval(callback: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, every: ms, run: callback });
    return id;
  }

  clearInterval(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.now = timer.at;
      if (timer.every > 0) timer.at += timer.every;
      else this.pending.delete(id);
      timer.run();
    }
    this.now = end;
  }
}

export class MemoryStorage implements SessionStorage {
  saved: SavedSession | null = null;
  save(session: SavedSession): void {
    this.saved = JSON.parse(JSON.stringify(session));
  }
  clear(): void {
    this.saved = null;
  }
}

export function device(overrides: Partial<Settings> = {}) {
  let time = 0;
  const view = new FakeView();
  const controller = new GameController({
    engine: new FakeEngine(),
    view,
    ui: new FakeUi(),
    sound: new FakeSound(),
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    seed: 1,
    now: () => time,
    delay: async () => {},
  });
  const starts: Array<{ color: Color; minutes: number }> = [];
  const game: SessionGame = {
    controller,
    async startGame(color, minutes) {
      starts.push({ color, minutes });
      controller.updateSettings({
        ...DEFAULT_SETTINGS,
        ...overrides,
        mode: 'online',
        humanColor: color,
        minutes,
      });
      await controller.newGame();
    },
  };
  return {
    controller,
    view,
    game,
    starts,
    timers: new ManualTimers(),
    storage: new MemoryStorage(),
    advance: (ms: number) => (time += ms),
    history: () => controller.game.history().map((m) => m.san),
  };
}
