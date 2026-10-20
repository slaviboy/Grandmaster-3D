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
import { ChessGame } from '../../src/game/ChessGame.ts';
import {
  coachMarks,
  describeMove,
  describeResult,
  isolatedPawns,
  passedPawns,
} from '../../src/game/coach.ts';
import { boardFromFen } from '../../src/game/types.ts';

const off = {
  captureMoves: false,
  checkMoves: false,
  board: 'off',
  pawns: 'off',
  side: 'w',
} as const;

describe('Chess Coach', () => {
  it('points out capture and checking moves for the side to move', () => {
    const game = new ChessGame('4k3/8/8/3p4/4P3/8/8/R3K3 w - - 0 1');
    expect(coachMarks(game, { ...off, captureMoves: true }).spots).toEqual(['d5']);
    expect(coachMarks(game, { ...off, checkMoves: true }).spots.sort()).toEqual(['a8']);
    expect(coachMarks(game, { ...off, captureMoves: true, side: 'b' }).spots).toEqual([]);
  });

  it('shows danger zones, safe zones and coverage', () => {
    const game = new ChessGame('4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1');
    // Black's d5 pawn is attacked by e4.
    expect(coachMarks(game, { ...off, board: 'danger', side: 'b' }).zones).toEqual(['d5']);
    expect(coachMarks(game, { ...off, board: 'coverage' }).zones).toContain('d5');
    const safe = coachMarks(game, { ...off, board: 'safe', side: 'b' }).zones;
    expect(safe).not.toContain('d5');
    expect(safe).not.toContain('f5');
    expect(safe).toContain('a6');
  });

  it('finds isolated and passed pawns', () => {
    const board = boardFromFen('4k3/p7/8/8/8/8/P1P3PP/4K3 w - - 0 1');
    expect(isolatedPawns(board, 'w').sort()).toEqual(['a2', 'c2']);
    expect(passedPawns(board, 'w').sort()).toEqual(['c2', 'g2', 'h2']);
    expect(passedPawns(board, 'b')).toEqual([]);
  });

  it('describes moves and results in plain words', () => {
    const game = new ChessGame();
    game.tryMove('e4');
    game.tryMove('d5');
    const capture = game.tryMove('exd5')!;
    expect(describeMove(capture, 'You', false)).toBe('You captured a pawn on d5 with the pawn.');
    expect(describeResult({ kind: 'checkmate', winner: 'b' })).toBe(
      'White is checkmated. Black wins.',
    );
    expect(describeResult({ kind: 'draw', reason: 'stalemate' })).toBe('Draw. Stalemate.');
  });
});
