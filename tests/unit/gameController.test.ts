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
import { GameController } from '../../src/game/GameController.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/Settings.ts';
import { FakeEngine, FakeSound, FakeUi, FakeView, flush } from '../support/fakes.ts';

function setup(overrides: Partial<Settings> = {}) {
  const engine = new FakeEngine();
  const view = new FakeView();
  const ui = new FakeUi();
  const sound = new FakeSound();
  let time = 0;
  const controller = new GameController({
    engine,
    view,
    ui,
    sound,
    settings: { ...DEFAULT_SETTINGS, difficulty: 'medium', minutes: 0, ...overrides },
    seed: 1,
    now: () => time,
    delay: async () => {},
  });
  return { controller, engine, view, ui, sound, advance: (ms: number) => (time += ms) };
}

describe('GameController', () => {
  it('runs a full turn: player moves, the engine replies, the player is up again', async () => {
    const { controller, engine, view } = setup();
    await controller.newGame();
    expect(controller.currentPhase).toBe('playerTurn');
    expect(view.interactive).toBe('w');

    expect(await controller.playerMove({ from: 'e2', to: 'e4' })).toBe(true);
    await flush();
    expect(controller.currentPhase).toBe('engineThinking');
    expect(view.interactive).toBeNull();

    const request = engine.reply('e7e5');
    expect(request.position).toBe('position startpos moves e2e4');
    await controller.whenIdle();
    expect(controller.currentPhase).toBe('playerTurn');
    expect(view.played.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(view.marks.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(controller.state.get().history).toHaveLength(2);
  });

  it('refuses moves while the engine thinks and for the wrong side', async () => {
    const { controller, engine } = setup();
    await controller.newGame();
    expect(controller.canPick('e7')).toBe(false);
    expect(await controller.playerMove({ from: 'e7', to: 'e5' })).toBe(false);
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await flush();
    expect(controller.canPick('d2')).toBe(false);
    expect(await controller.playerMove({ from: 'd2', to: 'd4' })).toBe(false);
    expect(controller.legalTargets('d2')).toEqual([]);
    engine.reply('e7e5');
    await controller.whenIdle();
    expect(controller.canPick('d2')).toBe(true);
  });

  it('rejects an illegal move and leaves the position alone', async () => {
    const { controller, sound } = setup();
    await controller.newGame();
    expect(await controller.playerMove({ from: 'e2', to: 'e5' })).toBe(false);
    expect(controller.game.fen()).toBe(START_FEN);
    expect(sound.played).toContain('illegal');
  });

  it('never plays an illegal engine move', async () => {
    const { controller, engine } = setup();
    await controller.newGame();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await flush();
    engine.reply('e2e4'); // nonsense for Black
    await controller.whenIdle();
    const last = controller.game.lastMove()!;
    expect(last.color).toBe('b');
    expect(controller.game.history()).toHaveLength(2);
  });

  it('ignores a stale engine reply after undo', async () => {
    const { controller, engine, view } = setup();
    await controller.newGame();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await flush();
    expect(engine.searches).toHaveLength(1);
    await controller.undo();
    expect(engine.cancels).toBeGreaterThan(0);
    expect(controller.game.fen()).toBe(START_FEN);
    expect(controller.currentPhase).toBe('playerTurn');
    // A late answer to the old search changes nothing.
    await flush();
    expect(view.played.map((m) => m.san)).toEqual(['e4']);
    expect(controller.game.history()).toHaveLength(0);
  });

  it('ignores a stale engine reply after a new game', async () => {
    const { controller, engine } = setup();
    await controller.newGame();
    await controller.playerMove({ from: 'd2', to: 'd4' });
    await flush();
    await controller.newGame();
    expect(controller.game.history()).toHaveLength(0);
    expect(engine.searches).toHaveLength(0);
    expect(controller.currentPhase).toBe('playerTurn');
  });

  it('takes back two plies on your turn and one while the engine thinks', async () => {
    const { controller, engine } = setup();
    await controller.newGame();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await flush();
    engine.reply('e7e5');
    await controller.whenIdle();
    await controller.undo();
    expect(controller.game.history()).toHaveLength(0);
    expect(controller.state.get().canRedo).toBe(true);

    await controller.redo();
    expect(controller.game.history().map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(controller.currentPhase).toBe('playerTurn');
  });

  it('lets the engine open when the player is Black', async () => {
    const { controller, engine, view } = setup({ humanColor: 'b' });
    await controller.newGame();
    await flush();
    expect(controller.currentPhase).toBe('engineThinking');
    engine.reply('d2d4');
    await controller.whenIdle();
    expect(view.interactive).toBe('b');
    expect(controller.canPick('d7')).toBe(true);
  });

  it('asks for a promotion piece and can be cancelled', async () => {
    const { controller, ui, engine } = setup({ mode: 'local' });
    await controller.newGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
    ui.answer = null;
    expect(await controller.playerMove({ from: 'a7', to: 'a8' })).toBe(false);
    expect(controller.currentPhase).toBe('playerTurn');
    expect(controller.game.get('a7')).toEqual({ color: 'w', kind: 'p' });

    ui.answer = 'n';
    expect(await controller.playerMove({ from: 'a7', to: 'a8' })).toBe(true);
    await controller.whenIdle();
    expect(controller.game.get('a8')).toEqual({ color: 'w', kind: 'n' });
    expect(ui.asked).toEqual(['w', 'w']);
    expect(engine.searches).toHaveLength(0);
  });

  it('plays both sides in a two-player game', async () => {
    const { controller, engine } = setup({ mode: 'local' });
    await controller.newGame();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await controller.whenIdle();
    expect(controller.canPick('e7')).toBe(true);
    await controller.playerMove({ from: 'e7', to: 'e5' });
    await controller.whenIdle();
    expect(engine.searches).toHaveLength(0);
    await controller.undo();
    expect(controller.game.history()).toHaveLength(1);
  });

  it('ends the game on checkmate and plays the end sound', async () => {
    const { controller, sound, view } = setup({ mode: 'local' });
    await controller.newGame();
    for (const [from, to] of [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ] as const) {
      await controller.playerMove({ from, to });
      await controller.whenIdle();
    }
    expect(controller.currentPhase).toBe('gameOver');
    expect(controller.state.get().status).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(sound.played.at(-1)).toBe('gameEnd');
    expect(view.marks.check).toBe('e1');
    expect(view.interactive).toBeNull();
  });

  it('resigns for the player', async () => {
    const { controller } = setup();
    await controller.newGame();
    await controller.resign();
    expect(controller.state.get().status).toEqual({ kind: 'resigned', winner: 'b' });
  });

  it('scores a flag fall', async () => {
    const { controller, advance } = setup({ mode: 'local', minutes: 5 });
    await controller.newGame();
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await controller.whenIdle();
    advance(5 * 60000 + 1);
    controller.tick();
    await flush();
    expect(controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
  });

  it('cancels a hint search when the player moves', async () => {
    const { controller, engine } = setup();
    await controller.newGame();
    const hint = controller.requestHint();
    expect(engine.searches).toHaveLength(1);
    await controller.playerMove({ from: 'g1', to: 'f3' });
    expect(await hint).toBeNull();
    await flush();
    expect(engine.searches).toHaveLength(1); // only the reply search remains
    expect(engine.searches[0]!.request.position).toBe('position startpos moves g1f3');
  });

  it('marks a hint on the board', async () => {
    const { controller, engine, view } = setup();
    await controller.newGame();
    const hint = controller.requestHint();
    engine.reply('d2d4');
    expect(await hint).toEqual({ from: 'd2', to: 'd4' });
    expect(view.marks.hint).toEqual({ from: 'd2', to: 'd4' });
  });

  it('survives repeated games', async () => {
    const { controller, engine } = setup();
    engine.autoReply = () => null; // forces the fallback path every time
    for (let i = 0; i < 5; i++) {
      await controller.newGame();
      await controller.playerMove({ from: 'e2', to: 'e4' });
      await controller.whenIdle();
      expect(controller.game.history()).toHaveLength(2);
      expect(controller.currentPhase).toBe('playerTurn');
    }
  });
});
