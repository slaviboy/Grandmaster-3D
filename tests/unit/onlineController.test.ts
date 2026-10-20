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
import { START_FEN } from '../../src/game/ChessGame.ts';
import { describeResult } from '../../src/game/coach.ts';
import { GameController, type LocalAction } from '../../src/game/GameController.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/Settings.ts';
import { FakeEngine, FakeSound, FakeUi, FakeView } from '../support/fakes.ts';

/** One player's side of an online game: White unless told otherwise, five minutes each. */
function side(overrides: Partial<Settings> = {}) {
  const view = new FakeView();
  const engine = new FakeEngine();
  let time = 0;
  const controller = new GameController({
    engine,
    view,
    ui: new FakeUi(),
    sound: new FakeSound(),
    settings: { ...DEFAULT_SETTINGS, mode: 'online', humanColor: 'w', minutes: 5, ...overrides },
    seed: 1,
    now: () => time,
    delay: async () => {},
  });
  const actions: LocalAction[] = [];
  controller.onLocalAction((a) => actions.push(a));
  return { controller, view, engine, actions, advance: (ms: number) => (time += ms) };
}

async function started(overrides: Partial<Settings> = {}) {
  const s = side(overrides);
  await s.controller.newGame();
  return s;
}

describe('GameController online', () => {
  it('reports the local move with its index and waits for the other player', async () => {
    const { controller, view, actions } = await started();
    expect(controller.currentPhase).toBe('playerTurn');
    expect(await controller.playerMove({ from: 'e2', to: 'e4' })).toBe(true);
    await controller.whenIdle();
    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'move',
        ply: 0,
        record: expect.objectContaining({ lan: 'e2e4' }),
      }),
    ]);
    expect(controller.currentPhase).toBe('remoteTurn');
    expect(view.interactive).toBeNull();
    expect(controller.canPick('e7')).toBe(false);
  });

  it('plays the other side through applyRemoteMove, then hands the turn back', async () => {
    const { controller, view } = await started({ humanColor: 'b' });
    expect(controller.currentPhase).toBe('remoteTurn');
    expect(await controller.applyRemoteMove('e2e4', 0)).toBe('played');
    await controller.whenIdle();
    expect(controller.currentPhase).toBe('playerTurn');
    expect(view.interactive).toBe('b');
    expect(controller.moveAudit()).toEqual([{ color: 'w', byEngine: false }]);
  });

  it('waits for the local animation before taking a quick reply', async () => {
    const { controller, view } = await started();
    view.holdAnimations = true;
    await controller.playerMove({ from: 'e2', to: 'e4' });
    const reply = controller.applyRemoteMove('e7e5', 1);
    view.holdAnimations = false;
    view.releaseAnimations();
    expect(await reply).toBe('played');
    await controller.whenIdle();
    expect(controller.game.history().map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('rejects illegal, out-of-turn, out-of-order and doctored moves, changing nothing', async () => {
    const { controller } = await started({ humanColor: 'b' });
    expect(await controller.applyRemoteMove('e2e5', 0)).toBe('rejected');
    expect(await controller.applyRemoteMove('e7e5', 0)).toBe('rejected');
    expect(await controller.applyRemoteMove('e2e4', 1)).toBe('rejected');
    expect(await controller.applyRemoteMove('e2e4q', 0)).toBe('rejected');
    expect(controller.game.fen()).toBe(START_FEN);
    expect(await controller.applyRemoteMove('e2e4', 0)).toBe('played');
    await controller.whenIdle();
    // The same move again, and a second move on the local player's turn.
    expect(await controller.applyRemoteMove('e2e4', 0)).toBe('rejected');
    expect(await controller.applyRemoteMove('d2d4', 1)).toBe('rejected');
    expect(controller.game.history()).toHaveLength(1);
  });

  it('refuses remote moves outside an online game', async () => {
    const { controller } = await started({ mode: 'local' });
    expect(await controller.applyRemoteMove('e2e4', 0)).toBe('rejected');
  });

  it('turns off undo, redo, hints and loading a game', async () => {
    const { controller, engine } = await started();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await controller.whenIdle();
    await controller.applyRemoteMove('e7e5', 1);
    await controller.whenIdle();
    expect(controller.state.get().canUndo).toBe(false);
    await controller.undo();
    expect(controller.game.history()).toHaveLength(2);
    expect(await controller.requestHint()).toBeNull();
    expect(engine.searches).toHaveLength(0);
    expect((await controller.loadFen(START_FEN)).ok).toBe(false);
    expect((await controller.loadPgn('1. d4 d5')).ok).toBe(false);
    expect(controller.game.history()).toHaveLength(2);
  });

  it('a resignation is always the local player losing, and is reported', async () => {
    const { controller, actions } = await started({ humanColor: 'b' });
    await controller.resign();
    expect(controller.state.get().status).toEqual({ kind: 'resigned', winner: 'w' });
    expect(actions).toEqual([{ kind: 'resign' }]);
  });

  it('the other side resigning, a draw by agreement and a forfeit end the game', async () => {
    let s = await started();
    await s.controller.remoteResigned();
    expect(s.controller.state.get().status).toEqual({ kind: 'resigned', winner: 'w' });

    s = await started();
    await s.controller.agreeDraw();
    expect(s.controller.state.get().status).toEqual({ kind: 'draw', reason: 'agreement' });

    s = await started({ humanColor: 'b' });
    await s.controller.forfeit('invalid-move');
    const status = s.controller.state.get().status;
    expect(status).toEqual({ kind: 'forfeit', winner: 'b', reason: 'invalid-move' });
    expect(describeResult(status)).toBe("White's app sent an invalid move. Black wins.");
    expect(await s.controller.applyRemoteMove('e2e4', 0)).toBe('late');
  });

  it('starts the clocks with the first move and charges the other side from the moment it is sent', async () => {
    const { controller, advance } = await started();
    advance(10_000);
    controller.tick();
    expect(controller.clock.elapsed('w')).toBe(0);
    await controller.playerMove({ from: 'e2', to: 'e4' });
    advance(3_000);
    await controller.whenIdle();
    expect(controller.clock.elapsed('b')).toBe(3_000);
    expect(controller.clock.active).toBe('b');
  });

  it('gives back network time, capped by what was used, and only on a legal move', async () => {
    const { controller, advance } = await started({ humanColor: 'b' });
    await controller.applyRemoteMove('e2e4', 0);
    await controller.whenIdle();
    advance(2_000);
    await controller.playerMove({ from: 'e7', to: 'e5' });
    await controller.whenIdle();
    advance(1_000);
    expect(await controller.applyRemoteMove('a1a5', 2, 250)).toBe('rejected');
    expect(controller.clock.elapsed('w')).toBe(1_000);
    expect(await controller.applyRemoteMove('g1f3', 2, 250)).toBe('played');
    expect(controller.clock.elapsed('w')).toBe(750);
  });

  it('lets the other side flag only after the lag allowance, and reports a local flag', async () => {
    const remote = await started({ minutes: 5 });
    remote.controller.setLagAllowance(300);
    await remote.controller.playerMove({ from: 'e2', to: 'e4' });
    await remote.controller.whenIdle();
    remote.advance(5 * 60_000 + 200);
    remote.controller.tick();
    expect(remote.controller.state.get().status.kind).toBe('playing');
    remote.advance(200);
    remote.controller.tick();
    await remote.controller.whenIdle();
    expect(remote.controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
    expect(remote.actions.map((a) => a.kind)).toEqual(['move']);

    const local = await started({ humanColor: 'b' });
    await local.controller.applyRemoteMove('e2e4', 0);
    await local.controller.whenIdle();
    local.advance(5 * 60_000);
    local.controller.tick();
    await local.controller.whenIdle();
    expect(local.controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
    expect(local.actions).toEqual([{ kind: 'flag' }]);
  });

  it('a flag the other side reports is theirs', async () => {
    const { controller } = await started();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await controller.whenIdle();
    await controller.remoteFlagged();
    expect(controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
  });

  it('restores a game that only grows, taking clocks only onto an empty board', async () => {
    const { controller } = await started({ humanColor: 'b' });
    expect(await controller.restoreOnline(['e2e4', 'e7e5', 'g1f3'], { w: 4_000, b: 2_000 })).toBe(
      true,
    );
    expect(controller.game.history().map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(controller.clock.elapsed('w')).toBe(4_000);
    expect(controller.currentPhase).toBe('playerTurn');
    expect(controller.moveAudit().map((m) => m.byEngine)).toEqual([false, false, false]);

    // A rewritten history, an illegal one, or one that is shorter: nothing changes.
    expect(await controller.restoreOnline(['d2d4', 'e7e5', 'g1f3', 'b8c6'])).toBe(false);
    expect(await controller.restoreOnline(['e2e4', 'e7e5', 'g1f3', 'e8e6'])).toBe(false);
    expect(await controller.restoreOnline(['e2e4'])).toBe(false);
    expect(await controller.restoreOnline(['e2e4', 'e7e5', 'g1f3', 'b8c6'], { w: 0, b: 0 })).toBe(
      true,
    );
    expect(controller.clock.elapsed('w')).toBe(4_000);
    expect(controller.game.history()).toHaveLength(4);
  });
});
