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

import { describe, expect, it } from 'vitest';
import { Clock, formatClock } from '../../src/game/Clock.ts';
import { DEFAULT_SETTINGS, loadSettings, sanitize, saveSettings } from '../../src/game/Settings.ts';

describe('Clock', () => {
  it('counts down only for the side whose clock runs', () => {
    let now = 0;
    const clock = new Clock(60000, () => now);
    clock.start('w');
    now = 10000;
    expect(clock.remaining('w')).toBe(50000);
    expect(clock.remaining('b')).toBe(60000);
    clock.start('b');
    now = 15000;
    expect(clock.remaining('w')).toBe(50000);
    expect(clock.remaining('b')).toBe(55000);
    clock.pause();
    now = 99999;
    expect(clock.remaining('b')).toBe(55000);
  });

  it('drops the flag once, at zero', () => {
    let now = 0;
    const clock = new Clock(1000, () => now);
    const flags: string[] = [];
    clock.onFlag((c) => flags.push(c));
    clock.start('b');
    now = 999;
    clock.tick();
    now = 1000;
    clock.tick();
    clock.tick();
    expect(flags).toEqual(['b']);
    expect(clock.active).toBeNull();
  });

  it('measures thinking time when untimed', () => {
    let now = 0;
    const clock = new Clock(null, () => now);
    clock.start('w');
    now = 4200;
    expect(clock.remaining('w')).toBe(Infinity);
    expect(clock.elapsed('w')).toBe(4200);
  });

  it('formats like a chess clock', () => {
    expect(formatClock(567000)).toBe('09:27');
    expect(formatClock(487100)).toBe('08:08');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(3723000)).toBe('1:02:03');
    expect(formatClock(Infinity)).toBe('--:--');
  });
});

describe('Settings', () => {
  it('defaults to the regular animations and a 10-minute game', () => {
    expect(DEFAULT_SETTINGS.followPath).toBe(false);
    expect(DEFAULT_SETTINGS.demolish).toBe(false);
    expect(DEFAULT_SETTINGS.minutes).toBe(10);
  });

  it('keeps valid stored values and drops wrong ones', () => {
    const s = sanitize({
      difficulty: 'hard',
      minutes: 7,
      humanColor: 'x',
      demolish: true,
      sound: 'yes',
      extra: 1,
    });
    expect(s.difficulty).toBe('hard');
    expect(s.minutes).toBe(10);
    expect(s.humanColor).toBe('w');
    expect(s.demolish).toBe(true);
    expect(s.sound).toBe(true);
    expect(s).not.toHaveProperty('extra');
  });

  it('keeps valid looks and custom colours, and drops bad ones', () => {
    const s = sanitize({
      boardTheme: 'marble',
      pieceTheme: 'no-such-set',
      tableTheme: 'custom',
      custom: { light: '#123456', dark: 'red', finish: 'metal', boardPattern: 'glass' },
    });
    expect(s.boardTheme).toBe('marble');
    expect(s.pieceTheme).toBe('classic');
    expect(s.tableTheme).toBe('custom');
    expect(s.custom.light).toBe('#123456');
    expect(s.custom.dark).toBe(DEFAULT_SETTINGS.custom.dark);
    expect(s.custom.finish).toBe('metal');
    expect(s.custom.boardPattern).toBe('wood');
  });

  it('keeps a known interface style and falls back to the default for anything else', () => {
    expect(sanitize({ uiStyle: 'retro' }).uiStyle).toBe('retro');
    expect(sanitize({ uiStyle: 'modern' }).uiStyle).toBe('modern');
    expect(sanitize({ uiStyle: 'fancy' }).uiStyle).toBe(DEFAULT_SETTINGS.uiStyle);
    expect(sanitize({}).uiStyle).toBe(DEFAULT_SETTINGS.uiStyle);
  });

  it('turns the board with a two-finger twist by default, and remembers the reverse', () => {
    expect(DEFAULT_SETTINGS.reverseTwist).toBe(false);
    expect(sanitize({ reverseTwist: true }).reverseTwist).toBe(true);
    expect(sanitize({ reverseTwist: 'yes' }).reverseTwist).toBe(false);
    expect(sanitize({}).reverseTwist).toBe(false);
  });

  it('shows the opponents as a slider by default, and remembers the compact grid', () => {
    expect(DEFAULT_SETTINGS.levelView).toBe('slider');
    expect(sanitize({ levelView: 'compact' }).levelView).toBe('compact');
    expect(sanitize({ levelView: 'carousel' }).levelView).toBe('slider');
    expect(sanitize({}).levelView).toBe('slider');
  });

  it('plays on the 3D board by default, and remembers the 2D board', () => {
    expect(DEFAULT_SETTINGS.boardView).toBe('3d');
    expect(sanitize({ boardView: '2d' }).boardView).toBe('2d');
    expect(sanitize({ boardView: '4d' }).boardView).toBe('3d');
    expect(sanitize({ boardView: 2 }).boardView).toBe('3d');
    // Settings saved before the 2D board existed get the 3D board.
    expect(sanitize({ uiStyle: 'retro' }).boardView).toBe('3d');
  });

  it('round-trips through storage and survives broken storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    saveSettings({ ...DEFAULT_SETTINGS, followPath: true }, storage);
    expect(loadSettings(storage).followPath).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });
});
