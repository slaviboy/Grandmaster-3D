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
import { checkConsistency } from '../../src/dev/ConsistencyChecker.ts';
import { FlatPieces } from '../../src/flat/FlatPieces.ts';
import { ChessGame, type MoveRecord } from '../../src/game/ChessGame.ts';
import { Tweener } from '../../src/scene/animation/tween.ts';
import { squareToWorld, type Square } from '../../src/scene/coords.ts';
import { flush } from '../support/fakes.ts';

function setup(fen?: string, followPath = false) {
  const tweener = new Tweener();
  let changes = 0;
  const pieces = new FlatPieces(
    tweener,
    () => ({ followPath }),
    () => changes++,
  );
  const game = new ChessGame(fen);
  pieces.sync(game.board());
  const play = (from: Square, to: Square, promotion?: 'q'): MoveRecord => {
    const record = game.tryMove({ from, to, promotion });
    if (!record) throw new Error(`illegal ${from}${to}`);
    return record;
  };
  const errors = () => checkConsistency(game.board(), pieces.snapshot());
  return { tweener, pieces, game, play, errors, changes: () => changes };
}

/** Runs the tweener until every animation, and what follows it, is done. */
async function runOut(tweener: Tweener): Promise<void> {
  for (let i = 0; i < 100; i++) {
    tweener.update(0.05);
    await flush(2);
    if (!tweener.running) {
      await flush(2);
      if (!tweener.running) return;
    }
  }
  throw new Error('animations never ended');
}

describe('2D board pieces', () => {
  it('shows a position with every figure on its square', () => {
    const { errors, pieces } = setup();
    expect(errors()).toEqual([]);
    expect(pieces.snapshot().meshCount).toBe(32);
  });

  it('updates the map at once and animates the figure to its square', async () => {
    const { tweener, pieces, play, errors } = setup();
    const done = pieces.playMove(play('g1', 'f3'));
    expect(pieces.snapshot().pieces.f3).toBe('wN');
    expect(pieces.snapshot().pieces.g1).toBeUndefined();
    tweener.update(0.2);
    const knight = pieces.get('f3')!;
    expect(knight.x).not.toBeCloseTo(squareToWorld('f3').x);
    expect(knight.lift).toBeGreaterThan(0);
    await runOut(tweener);
    await done;
    expect(errors()).toEqual([]);
  });

  it('removes a capture when the capturing piece lands', async () => {
    const { tweener, pieces, play, errors } = setup(
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
    const done = pieces.playMove(play('e4', 'd5'));
    expect(pieces.snapshot().meshCount).toBe(32);
    await runOut(tweener);
    await done;
    expect(errors()).toEqual([]);
    expect(pieces.snapshot().meshCount).toBe(31);
  });

  it('castles the rook after the king and captures en passant', async () => {
    const castle = setup('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', true);
    const done = castle.pieces.playMove(castle.play('e1', 'c1'));
    expect(castle.pieces.snapshot().pieces.d1).toBe('wR');
    await runOut(castle.tweener);
    await done;
    expect(castle.errors()).toEqual([]);

    const ep = setup('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
    const taken = ep.pieces.playMove(ep.play('e5', 'f6'));
    expect(ep.pieces.snapshot().pieces.f5).toBeUndefined();
    await runOut(ep.tweener);
    await taken;
    expect(ep.errors()).toEqual([]);
  });

  it('promotes: the pawn gives way to the new piece', async () => {
    const { tweener, pieces, play, errors } = setup('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
    const done = pieces.playMove(play('e7', 'e8', 'q'));
    expect(pieces.snapshot().pieces.e8).toBe('wQ');
    await runOut(tweener);
    await done;
    expect(errors()).toEqual([]);
    expect(pieces.get('e8')!.scale).toBe(1);
  });

  it('leaves a correct board when a castling move is finished early', async () => {
    const { pieces, play, errors } = setup('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    const done = pieces.playMove(play('e1', 'g1'));
    pieces.finish();
    await done;
    expect(errors()).toEqual([]);
  });

  it('never moves a figure again once the board was shown afresh', async () => {
    const { tweener, pieces, play, game, errors } = setup();
    const done = pieces.playMove(play('b1', 'c3'));
    tweener.update(0.1);
    pieces.sync(game.board());
    expect(errors()).toEqual([]);
    tweener.update(0.1);
    expect(errors()).toEqual([]);
    await runOut(tweener);
    await done;
    expect(errors()).toEqual([]);
  });

  it('settles a dropped piece from where it was let go, and puts back a refused one', async () => {
    const { tweener, pieces, play, errors } = setup();
    expect(pieces.pickUp('e2')).toBe(true);
    pieces.carry('e2', { x: 0.6, z: -0.4 });
    const done = pieces.playMove(play('e2', 'e4'), { x: 0.6, z: -0.4 });
    tweener.update(0.01);
    expect(pieces.get('e4')!.x).toBeGreaterThan(0.4);
    await runOut(tweener);
    await done;
    expect(errors()).toEqual([]);

    pieces.pickUp('d2');
    pieces.carry('d2', { x: -1, z: 0 });
    const back = pieces.putBack('d2');
    await runOut(tweener);
    await back;
    expect(errors()).toEqual([]);
  });
});
