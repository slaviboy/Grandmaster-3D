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
import { ChessGame, START_FEN, parseUci } from '../../src/game/ChessGame.ts';

function play(game: ChessGame, sans: string[]): void {
  for (const san of sans) {
    expect(game.tryMove(san), `move ${san}`).not.toBeNull();
  }
}

describe('ChessGame', () => {
  it('starts from the standard position with White to move', () => {
    const game = new ChessGame();
    expect(game.fen()).toBe(START_FEN);
    expect(game.turn()).toBe('w');
    expect(Object.keys(game.board())).toHaveLength(32);
    expect(game.status()).toEqual({ kind: 'playing' });
  });

  it('gives each piece type its legal moves', () => {
    const game = new ChessGame('4k3/8/8/3N4/8/8/1P6/R3K2R w KQ - 0 1');
    expect(game.legalTargets('d5').sort()).toEqual([
      'b4',
      'b6',
      'c3',
      'c7',
      'e3',
      'e7',
      'f4',
      'f6',
    ]);
    expect(game.legalTargets('b2').sort()).toEqual(['b3', 'b4']);
    expect(game.legalTargets('e1')).toContain('g1');
    expect(game.legalTargets('e1')).toContain('c1');
    expect(new ChessGame().legalTargets('d1')).toEqual([]);
  });

  it('rejects illegal moves without changing anything', () => {
    const game = new ChessGame();
    expect(game.tryMove({ from: 'e2', to: 'e5' })).toBeNull();
    expect(game.tryMove({ from: 'e7', to: 'e5' })).toBeNull(); // not Black's turn
    expect(game.tryMove('Qh5')).toBeNull();
    expect(game.fen()).toBe(START_FEN);
    expect(game.history()).toHaveLength(0);
  });

  it('castles on both sides', () => {
    const kingside = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const short = kingside.tryMove({ from: 'e1', to: 'g1' });
    expect(short?.kingsideCastle).toBe(true);
    expect(kingside.get('f1')).toEqual({ color: 'w', kind: 'r' });
    const long = kingside.tryMove({ from: 'e8', to: 'c8' });
    expect(long?.queensideCastle).toBe(true);
    expect(kingside.get('d8')).toEqual({ color: 'b', kind: 'r' });
  });

  it('refuses to castle through check', () => {
    const game = new ChessGame('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
    expect(game.legalTargets('e1')).not.toContain('g1');
  });

  it('captures en passant and removes the passed pawn', () => {
    const game = new ChessGame();
    play(game, ['e4', 'a6', 'e5', 'd5']);
    const move = game.tryMove({ from: 'e5', to: 'd6' });
    expect(move?.enPassant).toBe(true);
    expect(game.get('d5')).toBeUndefined();
    expect(game.captured().b).toEqual(['p']);
  });

  it('requires a piece choice for promotion and promotes to each kind', () => {
    for (const promotion of ['q', 'r', 'b', 'n'] as const) {
      const game = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
      expect(game.needsPromotion('a7', 'a8')).toBe(true);
      expect(game.isLegal({ from: 'a7', to: 'a8' })).toBe(false);
      expect(game.tryMove({ from: 'a7', to: 'a8' })).toBeNull();
      const move = game.tryMove({ from: 'a7', to: 'a8', promotion });
      expect(move?.promotion).toBe(promotion);
      expect(game.get('a8')).toEqual({ color: 'w', kind: promotion });
    }
  });

  it('detects check and checkmate', () => {
    const game = new ChessGame();
    play(game, ['f3', 'e5', 'g4']);
    expect(game.tryMove('Qh4#')).not.toBeNull();
    expect(game.inCheck()).toBe(true);
    expect(game.status()).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(game.legalMoves()).toEqual([]);
  });

  it('detects stalemate', () => {
    // Black king on h8, White queen g6 and king h6: Black has no legal move but is not in check.
    const stalemate = new ChessGame('7k/8/6QK/8/8/8/8/8 b - - 0 1');
    expect(stalemate.status()).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  it('detects insufficient material, threefold repetition and the fifty-move rule', () => {
    expect(new ChessGame('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1').status()).toEqual({
      kind: 'draw',
      reason: 'insufficient',
    });

    const repeat = new ChessGame();
    play(repeat, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(repeat.status()).toEqual({ kind: 'draw', reason: 'threefold' });

    const fifty = new ChessGame('4k3/8/8/8/8/8/4R3/4K3 w - - 99 80');
    fifty.tryMove({ from: 'e2', to: 'd2' });
    expect(fifty.status()).toEqual({ kind: 'draw', reason: 'fifty-moves' });
  });

  it('undoes and redoes moves, and a new move clears the redo stack', () => {
    const game = new ChessGame();
    play(game, ['e4', 'e5', 'Nf3']);
    const afterThree = game.fen();
    expect(game.undo()?.san).toBe('Nf3');
    expect(game.undo()?.san).toBe('e5');
    expect(game.canRedo()).toBe(true);
    expect(game.redo()?.san).toBe('e5');
    expect(game.redo()?.san).toBe('Nf3');
    expect(game.fen()).toBe(afterThree);
    expect(game.canRedo()).toBe(false);

    game.undo();
    game.tryMove('Nc3');
    expect(game.canRedo()).toBe(false);
    expect(game.history().map((m) => m.san)).toEqual(['e4', 'e5', 'Nc3']);
  });

  it('undoes promotions and captures back to the exact position', () => {
    const game = new ChessGame('1n6/P7/8/8/8/8/8/k6K w - - 0 1');
    const before = game.fen();
    game.tryMove({ from: 'a7', to: 'b8', promotion: 'q' });
    expect(game.captured().b).toEqual(['n']);
    game.undo();
    expect(game.fen()).toBe(before);
    expect(game.captured().b).toEqual([]);
    expect(game.redo()?.promotion).toBe('q');
    expect(game.get('b8')).toEqual({ color: 'w', kind: 'q' });
  });

  it('keeps repetition counts right across undo and redo', () => {
    const game = new ChessGame();
    play(game, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']);
    game.undo();
    game.redo();
    expect(game.status().kind).toBe('playing');
    game.tryMove('Ng8');
    expect(game.status()).toEqual({ kind: 'draw', reason: 'threefold' });
  });

  it('loads FEN, and keeps the game when the FEN is invalid', () => {
    const game = new ChessGame();
    play(game, ['e4']);
    const fen = game.fen();
    expect(game.loadFen('not a fen').ok).toBe(false);
    expect(game.fen()).toBe(fen);
    expect(game.history()).toHaveLength(1);
    expect(game.loadFen('8/8/8/4k3/8/8/8/4K2R w K - 0 1')).toEqual({ ok: true });
    expect(game.history()).toHaveLength(0);
  });

  it('round-trips PGN and keeps the game when a PGN is broken', () => {
    const game = new ChessGame();
    play(game, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
    const pgn = game.toPgn({ White: 'Player', Black: 'Computer' });
    expect(pgn).toContain('[White "Player"]');

    const copy = new ChessGame();
    expect(copy.loadPgn(pgn)).toEqual({ ok: true });
    expect(copy.fen()).toBe(game.fen());
    expect(copy.history().map((m) => m.san)).toEqual(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
    expect(copy.canUndo()).toBe(true);

    const fen = copy.fen();
    expect(copy.loadPgn('1. e4 e5 2. Qxf7 Kxf7').ok).toBe(false);
    expect(copy.fen()).toBe(fen);
    expect(copy.history()).toHaveLength(6);
  });

  it('records resignation and time results, and lets undo clear them', () => {
    const game = new ChessGame();
    play(game, ['e4']);
    game.setResult({ kind: 'resigned', winner: 'w' });
    expect(game.isOver()).toBe(true);
    expect(game.tryMove('e5')).toBeNull();
    game.undo();
    expect(game.status().kind).toBe('playing');
  });

  it('scores a flag fall as a loss unless the opponent cannot mate', () => {
    expect(new ChessGame().timeout('w')).toEqual({ kind: 'timeout', winner: 'b' });
    const loneKnight = new ChessGame('4k3/8/8/8/8/8/8/1N2K3 b - - 0 1');
    expect(loneKnight.timeout('b')).toEqual({ kind: 'draw', reason: 'timeout' });
    const knightVsPawn = new ChessGame('4k3/4p3/8/8/8/8/8/1N2K3 b - - 0 1');
    expect(knightVsPawn.timeout('b')).toEqual({ kind: 'timeout', winner: 'w' });
  });

  it('describes the position for the engine', () => {
    const game = new ChessGame();
    expect(game.uciPosition()).toBe('position startpos');
    play(game, ['e4', 'e5']);
    expect(game.uciPosition()).toBe('position startpos moves e2e4 e7e5');
    const custom = new ChessGame('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    custom.tryMove('e4');
    expect(custom.uciPosition()).toBe('position fen 4k3/8/8/8/8/8/4P3/4K3 w - - 0 1 moves e2e4');
    expect(custom.tryUci('e8d7')?.san).toBe('Kd7');
  });

  it('parses UCI moves', () => {
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
    expect(parseUci('a7a8q')).toEqual({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(parseUci('(none)')).toBeNull();
    expect(parseUci('e2e9')).toBeNull();
  });
});
