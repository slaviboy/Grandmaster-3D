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
import { lineScore, parseBestmove, parseInfo, parseOption } from '../../src/engine/uci.ts';

describe('UCI parsing', () => {
  it('reads depth, multipv, centipawn score and the principal variation', () => {
    expect(
      parseInfo(
        'info depth 12 seldepth 18 multipv 2 score cp -34 nodes 1000 nps 9 pv e7e5 g1f3 b8c6',
      ),
    ).toEqual({ multipv: 2, depth: 12, cp: -34, mate: undefined, pv: ['e7e5', 'g1f3', 'b8c6'] });
  });

  it('reads mate scores, including being mated', () => {
    expect(parseInfo('info depth 5 score mate 3 pv d1h5')?.mate).toBe(3);
    expect(parseInfo('info depth 5 score mate -2 pv a2a3')?.mate).toBe(-2);
  });

  it('marks bound scores and skips lines without a variation', () => {
    expect(parseInfo('info depth 9 score cp 20 lowerbound pv e2e4')?.bound).toBe('lower');
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfo('info depth 0 score mate 0')).toBeNull();
    expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull();
  });

  it('reads bestmove with and without ponder, and (none)', () => {
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4', ponder: 'e7e5' });
    expect(parseBestmove('bestmove a7a8q')).toEqual({ move: 'a7a8q' });
    expect(parseBestmove('bestmove (none)')).toEqual({ move: null });
    expect(parseBestmove('info depth 1')).toBeNull();
  });

  it('reads engine options', () => {
    expect(parseOption('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      name: 'UCI_Elo',
      type: 'spin',
      default: '1320',
      min: 1320,
      max: 3190,
    });
    expect(parseOption('option name Clear Hash type button')).toEqual({
      name: 'Clear Hash',
      type: 'button',
    });
    expect(
      parseOption('option name EvalFile type string default nn-61e7af4bb97d.nnue')?.default,
    ).toBe('nn-61e7af4bb97d.nnue');
  });

  it('ranks mates above any centipawn score', () => {
    expect(lineScore({ multipv: 1, depth: 1, mate: 2, pv: ['a'] })).toBeGreaterThan(
      lineScore({ multipv: 1, depth: 1, mate: 5, pv: ['a'] }),
    );
    expect(lineScore({ multipv: 1, depth: 1, mate: 5, pv: ['a'] })).toBeGreaterThan(5000);
    expect(lineScore({ multipv: 1, depth: 1, mate: -1, pv: ['a'] })).toBeLessThan(-5000);
  });
});
