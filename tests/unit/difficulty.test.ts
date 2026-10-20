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
import { createRng } from '../../src/core/rng.ts';
import { DIFFICULTIES, difficulty, isDifficultyId } from '../../src/engine/difficulty.ts';
import { pickMove } from '../../src/engine/movePolicy.ts';
import type { PvLine } from '../../src/engine/uci.ts';

describe('difficulty presets', () => {
  it('offers six levels in rising strength', () => {
    expect(DIFFICULTIES.map((d) => d.label)).toEqual([
      'Beginner',
      'Easy',
      'Medium',
      'Hard',
      'Expert',
      'Maximum Strength',
    ]);
    const ratings = DIFFICULTIES.map((d) => d.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
  });

  it('sets every engine option on every level, within the engine limits', () => {
    for (const preset of DIFFICULTIES) {
      const o = preset.options;
      for (const name of ['Skill Level', 'UCI_LimitStrength', 'UCI_Elo', 'MultiPV', 'Hash']) {
        expect(o, `${preset.id} sets ${name}`).toHaveProperty(name);
      }
      expect(Number(o['UCI_Elo'])).toBeGreaterThanOrEqual(1320);
      expect(Number(o['UCI_Elo'])).toBeLessThanOrEqual(3190);
      expect(Number(o['Skill Level'])).toBeGreaterThanOrEqual(0);
      expect(Number(o['Skill Level'])).toBeLessThanOrEqual(20);
      expect(preset.go.movetime ?? preset.go.depth).toBeDefined();
    }
  });

  it('uses candidate-move policies only below the engine strength limit', () => {
    expect(difficulty('beginner').policy).not.toBeNull();
    expect(difficulty('easy').policy).not.toBeNull();
    expect(difficulty('beginner').options['UCI_LimitStrength']).toBe(false);
    for (const id of ['medium', 'hard', 'expert', 'maximum'] as const)
      expect(difficulty(id).policy).toBeNull();
    expect(difficulty('maximum').options['UCI_LimitStrength']).toBe(false);
    expect(isDifficultyId('hard')).toBe(true);
    expect(isDifficultyId('impossible')).toBe(false);
  });
});

const line = (move: string, cp: number, multipv = 1, extra: Partial<PvLine> = {}): PvLine => ({
  multipv,
  depth: 6,
  cp,
  pv: [move],
  ...extra,
});

describe('move policy', () => {
  const lines = [
    line('e2e4', 40, 1),
    line('d2d4', 30, 2),
    line('g1f3', 20, 3),
    line('a2a3', -60, 4),
    line('f2f3', -900, 5),
  ];
  const legal = new Set(['e2e4', 'd2d4', 'g1f3', 'a2a3', 'f2f3']);

  it('is deterministic for a seed and only returns legal moves', () => {
    const a = Array.from({ length: 50 }, (_, i) =>
      pickMove(lines, difficulty('beginner').policy!, createRng(i), legal),
    );
    const b = Array.from({ length: 50 }, (_, i) =>
      pickMove(lines, difficulty('beginner').policy!, createRng(i), legal),
    );
    expect(a).toEqual(b);
    expect(a.every((m) => m !== null && legal.has(m))).toBe(true);
    const restricted = new Set(['g1f3']);
    expect(pickMove(lines, difficulty('easy').policy!, createRng(1), restricted)).toBe('g1f3');
  });

  it('makes Beginner vary its play and Easy prefer the best move', () => {
    const count = (id: 'beginner' | 'easy') => {
      const rng = createRng(42);
      let best = 0;
      for (let i = 0; i < 1000; i++)
        if (pickMove(lines, difficulty(id).policy!, rng, legal) === 'e2e4') best++;
      return best;
    };
    expect(count('beginner')).toBeLessThan(700);
    expect(count('easy')).toBeGreaterThan(count('beginner'));
  });

  it('rarely allows big blunders, and only on the blunder roll', () => {
    const easy = difficulty('easy').policy!;
    const rng = createRng(7);
    let blunders = 0;
    for (let i = 0; i < 2000; i++) if (pickMove(lines, easy, rng, legal) === 'f2f3') blunders++;
    expect(blunders).toBeLessThan(2000 * easy.blunderChance);
  });

  it('takes a mate when one is offered', () => {
    const mating = [line('d1h5', 0, 1, { cp: undefined, mate: 1 }), line('e2e4', 30, 2)];
    const strict = { temperature: 30, blunderChance: 0, maxCpLoss: 300 };
    expect(pickMove(mating, strict, createRng(3), new Set(['d1h5', 'e2e4']))).toBe('d1h5');
  });

  it('ignores bound scores and returns null without legal candidates', () => {
    expect(
      pickMove(
        [line('e2e4', 30, 1, { bound: 'lower' })],
        difficulty('easy').policy!,
        createRng(1),
        legal,
      ),
    ).toBeNull();
    expect(pickMove(lines, difficulty('easy').policy!, createRng(1), new Set())).toBeNull();
  });
});
