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

// The 3D board as the game controller sees it: show a position, animate a move, mark squares and
// say whose pieces may be picked. It ties the piece map, the animations, the highlights and the
// pointer input together.

import type { Vector3 } from 'three';
import type { MoveRecord } from '../game/ChessGame.ts';
import type { BoardViewPort, MoveMarks } from '../game/GameController.ts';
import type { BoardMap, Color } from '../game/types.ts';
import type { AnimationController } from './AnimationController.ts';
import type { Highlights } from './Highlights.ts';
import type { InteractionController } from './InteractionController.ts';
import type { PieceManager } from './PieceManager.ts';

export class BoardView implements BoardViewPort {
  private pendingDrop: { readonly from: string; readonly to: string; readonly at: Vector3 } | null =
    null;
  interaction: InteractionController | null = null;

  constructor(
    private readonly pieces: PieceManager,
    private readonly animations: AnimationController,
    private readonly highlights: Highlights,
    private readonly requestRender: () => void,
  ) {}

  /** Remembers where a dragged piece was dropped, so its move animates from there. */
  noteDrop(from: string, to: string, at: Vector3): void {
    this.pendingDrop = { from, to, at: at.clone() };
  }

  sync(board: BoardMap): void {
    this.pendingDrop = null;
    this.pieces.sync(board);
    this.requestRender();
  }

  async playMove(move: MoveRecord): Promise<void> {
    const drop = this.pendingDrop;
    this.pendingDrop = null;
    const dropped = drop && drop.from === move.from && drop.to === move.to ? drop.at : undefined;
    await this.animations.playMove(move, dropped);
    this.requestRender();
  }

  finishAnimations(): void {
    this.animations.finishAll();
    this.requestRender();
  }

  setMarks(marks: MoveMarks): void {
    this.highlights.set({ lastMove: marks.lastMove, check: marks.check, hint: marks.hint });
  }

  setInteractive(side: Color | null): void {
    this.interaction?.setEnabled(side !== null);
  }
}
