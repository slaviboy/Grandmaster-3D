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
import { ViewSwitch } from '../../src/app/ViewSwitch.ts';
import { GameController } from '../../src/game/GameController.ts';
import { DEFAULT_SETTINGS } from '../../src/game/Settings.ts';
import type { BoardMap } from '../../src/game/types.ts';
import { FakeEngine, FakeSound, FakeUi, FakeView, flush } from '../support/fakes.ts';

/** A two-player game behind a switch between two recorded boards, 3D shown first. */
function setup() {
  const views = { '3d': new FakeView(), '2d': new FakeView() };
  let controller: GameController | null = null;
  const board = (): BoardMap => controller!.game.board();
  const view = new ViewSwitch(views, '3d', board);
  controller = new GameController({
    engine: new FakeEngine(),
    view,
    ui: new FakeUi(),
    sound: new FakeSound(),
    settings: { ...DEFAULT_SETTINGS, mode: 'local', minutes: 0 },
    seed: 1,
    delay: async () => {},
  });
  return { views, view, controller };
}

describe('ViewSwitch', () => {
  it('animates on the shown board and keeps the hidden one on the same position', async () => {
    const { views, controller } = setup();
    await controller.newGame();
    expect(views['3d'].synced).toHaveLength(1);
    expect(views['2d'].synced).toHaveLength(1);
    await controller.playerMove({ from: 'e2', to: 'e4' });
    await controller.whenIdle();
    expect(views['3d'].played.map((m) => m.san)).toEqual(['e4']);
    expect(views['2d'].played).toEqual([]);
    expect(views['2d'].synced.at(-1)).toEqual(controller.game.board());
    // Marks go to both; the player's input only to the shown board.
    expect(views['2d'].marks.lastMove).toEqual({ from: 'e2', to: 'e4' });
    expect(views['3d'].interactive).toBe('b');
    expect(views['2d'].interactive).toBeNull();
  });

  it('hands the game to the other board, even in the middle of a move', async () => {
    const { views, view, controller } = setup();
    await controller.newGame();
    views['3d'].holdAnimations = true;
    await controller.playerMove({ from: 'g1', to: 'f3' });
    await flush();
    expect(controller.currentPhase).toBe('animating');

    const finished = views['3d'].finished;
    view.show('2d');
    expect(view.current).toBe('2d');
    expect(views['3d'].finished).toBe(finished + 1);
    expect(views['3d'].synced.at(-1)).toEqual(controller.game.board());
    expect(views['2d'].synced.at(-1)).toEqual(controller.game.board());
    await controller.whenIdle();
    expect(controller.currentPhase).toBe('playerTurn');
    expect(views['2d'].interactive).toBe('b');
    expect(views['3d'].interactive).toBeNull();

    await controller.playerMove({ from: 'g8', to: 'f6' });
    await controller.whenIdle();
    expect(views['2d'].played.map((m) => m.san)).toEqual(['Nf6']);
    expect(views['3d'].synced.at(-1)).toEqual(controller.game.board());
  });

  it('shows nothing before the game has its first position', () => {
    const views = { a: new FakeView(), b: new FakeView() };
    const view = new ViewSwitch(views, 'a', () => {
      throw new Error('no position yet');
    });
    view.show('b');
    view.show('a');
    expect(views.a.synced).toEqual([]);
    expect(views.b.synced).toEqual([]);
  });

  it('keeps the game going when the hidden board fails', async () => {
    const { views, controller } = setup();
    await controller.newGame();
    views['2d'].sync = () => {
      throw new Error('broken');
    };
    const error = console.error;
    console.error = () => {};
    try {
      await controller.playerMove({ from: 'e2', to: 'e4' });
      await controller.whenIdle();
    } finally {
      console.error = error;
    }
    expect(controller.currentPhase).toBe('playerTurn');
    expect(views['3d'].played).toHaveLength(1);
  });
});
