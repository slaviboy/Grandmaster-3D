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
