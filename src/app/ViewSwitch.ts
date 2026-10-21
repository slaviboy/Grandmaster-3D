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

// The board as the controller sees it, when there are two: the 3D board and the 2D one. Moves are
// animated on the board that is shown; the hidden one is kept on the same position without
// animating, so either can be shown at any moment and both always pass the consistency check.
// Only the shown board takes the player's input.

import type { MoveRecord } from '../game/ChessGame.ts';
import type { BoardViewPort, MoveMarks } from '../game/GameController.ts';
import type { BoardMap, Color } from '../game/types.ts';

export class ViewSwitch<Kind extends string> implements BoardViewPort {
  private interactive: Color | null = null;
  /** Nothing is shown before the controller's first position (the 3D pieces may still load). */
  private started = false;

  constructor(
    private readonly views: Readonly<Record<Kind, BoardViewPort>>,
    private shown: NoInfer<Kind>,
    /** The current position, for bringing a board up to date. */
    private readonly board: () => BoardMap,
  ) {}

  get current(): Kind {
    return this.shown;
  }

  /** Shows the other board: the old one stops at once and the new one takes over the game. */
  show(kind: Kind): void {
    if (kind === this.shown) return;
    const old = this.views[this.shown];
    old.finishAnimations();
    old.setInteractive(null);
    this.shown = kind;
    if (this.started) {
      // A move cut short may not have reached its castling rook or its promotion yet.
      const board = this.board();
      old.sync(board);
      this.views[kind].sync(board);
    }
    this.views[kind].setInteractive(this.interactive);
  }

  sync(board: BoardMap): void {
    this.started = true;
    for (const view of this.all()) view.sync(board);
  }

  playMove(move: MoveRecord): Promise<void> {
    const played = this.views[this.shown].playMove(move);
    for (const view of this.hidden()) {
      // A hidden board that fails must not hold up the game on the shown one.
      try {
        view.sync(this.board());
      } catch (error) {
        console.error('the hidden board could not follow the move:', error);
      }
    }
    return played;
  }

  finishAnimations(): void {
    for (const view of this.all()) view.finishAnimations();
  }

  setMarks(marks: MoveMarks): void {
    for (const view of this.all()) view.setMarks(marks);
  }

  setInteractive(side: Color | null): void {
    this.interactive = side;
    this.views[this.shown].setInteractive(side);
  }

  private all(): BoardViewPort[] {
    return Object.values<BoardViewPort>(this.views);
  }

  private hidden(): BoardViewPort[] {
    return (Object.keys(this.views) as Kind[])
      .filter((kind) => kind !== this.shown)
      .map((kind) => this.views[kind]);
  }
}
