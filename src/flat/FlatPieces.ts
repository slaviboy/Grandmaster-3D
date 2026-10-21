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

// The 2D board's pieces. As on the 3D board, the piece map leads: it always holds the logical
// position, and a move updates it at once (the captured piece, the mover, a castling rook, a
// promotion). The drawn figures then catch up on the shared Tweener with the same routes and
// timings as the 3D pieces. Every move runs under an epoch; finish() and sync() bump it, so a
// move cut short never touches the figures again and the board can be shown afresh at once.

import type { MoveRecord } from '../game/ChessGame.ts';
import { pieceCode, type BoardMap, type Color, type PieceKind } from '../game/types.ts';
import { buildPath } from '../scene/animation/paths.ts';
import {
  easeInOutCubic,
  easeOutCubic,
  easeTrapezoid,
  type Tweener,
} from '../scene/animation/tween.ts';
import { SQUARES, squareToWorld, type BoardPoint, type Square } from '../scene/coords.ts';

/** One figure as drawn: where it stands on the board plane and how it looks right now. */
export interface FlatFigure {
  readonly color: Color;
  readonly kind: PieceKind;
  x: number;
  z: number;
  /** Height above the board while it travels or is carried, in squares. */
  lift: number;
  /** Size, 1 normally; a promotion shrinks the pawn and grows the new piece. */
  scale: number;
}

export interface FlatSnapshot {
  readonly pieces: Partial<Record<Square, string>>;
  readonly positions: Partial<Record<Square, { x: number; y: number; z: number }>>;
  readonly meshCount: number;
}

const SECONDS_PER_SQUARE = 0.3;
/** How high a carried piece is held. */
export const CARRY_LIFT = 0.45;

export class FlatPieces {
  private readonly figures = new Map<Square, FlatFigure>();
  /** Figures still drawn but off the board: a capture until the mover lands, a promoted pawn. */
  private readonly leaving = new Set<FlatFigure>();
  private epoch = 0;

  constructor(
    private readonly tweener: Tweener,
    private readonly settings: () => { readonly followPath: boolean },
    private readonly changed: () => void,
  ) {}

  get(square: Square): FlatFigure | undefined {
    return this.figures.get(square);
  }

  /** Everything to draw, back to front: standing pieces, leaving ones, then any in the air. */
  figuresToDraw(): FlatFigure[] {
    const all = [...this.leaving, ...this.figures.values()];
    return all.sort((a, b) => a.lift - b.lift);
  }

  /** Shows `board` at once: keeps figures already right, reuses movable ones, adds the rest. */
  sync(board: BoardMap): void {
    this.epoch++;
    this.leaving.clear();
    const spare: FlatFigure[] = [];
    for (const square of SQUARES) {
      const figure = this.figures.get(square);
      const want = board[square];
      if (figure && (!want || want.color !== figure.color || want.kind !== figure.kind)) {
        this.figures.delete(square);
        spare.push(figure);
      }
    }
    for (const square of SQUARES) {
      const want = board[square];
      if (!want || this.figures.has(square)) continue;
      const index = spare.findIndex((f) => f.color === want.color && f.kind === want.kind);
      const figure =
        index >= 0 ? spare.splice(index, 1)[0]! : { ...want, x: 0, z: 0, lift: 0, scale: 1 };
      this.figures.set(square, figure);
    }
    this.snapAll();
  }

  /** Ends whatever is running, every figure on its square. */
  finish(): void {
    this.epoch++;
    this.tweener.finishAll();
    this.leaving.clear();
    this.snapAll();
  }

  /** Plays a move the rules accepted; `dropped` is where a carried piece was let go. */
  async playMove(move: MoveRecord, dropped?: BoardPoint): Promise<void> {
    const epoch = this.epoch;
    const mover = this.figures.get(move.from);
    if (!mover) return;

    const victimSquare = move.enPassant
      ? (`${move.to[0]}${move.from[1]}` as Square)
      : move.capture
        ? move.to
        : null;
    const victim = victimSquare ? this.figures.get(victimSquare) : undefined;
    if (victimSquare) this.figures.delete(victimSquare);
    if (victim) this.leaving.add(victim);
    this.figures.delete(move.from);
    this.figures.set(move.to, mover);

    const castle = move.kingsideCastle || move.queensideCastle;
    const rank = move.color === 'w' ? '1' : '8';
    const rookFrom = `${move.kingsideCastle ? 'h' : 'a'}${rank}` as Square;
    const rookTo = `${move.kingsideCastle ? 'f' : 'd'}${rank}` as Square;
    const rook = castle ? this.figures.get(rookFrom) : undefined;
    if (rook) {
      this.figures.delete(rookFrom);
      this.figures.set(rookTo, rook);
    }

    let promoted: FlatFigure | undefined;
    if (move.promotion) {
      promoted = {
        color: move.color,
        kind: move.promotion,
        ...squareToWorld(move.to),
        lift: 0,
        scale: 0,
      };
      this.figures.set(move.to, promoted);
      this.leaving.add(mover);
    }
    this.changed();

    if (dropped) await this.settle(mover, move.to, dropped, epoch);
    else await this.travel(mover, move.from, move.to, move.piece === 'n', epoch);
    if (epoch !== this.epoch) return;
    if (victim) this.leaving.delete(victim);
    this.place(mover, move.to);

    if (rook) {
      await this.travel(rook, rookFrom, rookTo, false, epoch);
      if (epoch !== this.epoch) return;
      this.place(rook, rookTo);
    }

    if (promoted) {
      const done = promoted;
      await this.tweener.run(
        0.3,
        (t) => {
          if (epoch !== this.epoch) return;
          mover.scale = Math.max(0, 1 - t);
          // A small overshoot makes the new piece pop into place.
          done.scale = t < 0.75 ? (t / 0.75) * 1.12 : 1.12 - ((t - 0.75) / 0.25) * 0.12;
          this.changed();
        },
        (t) => t,
      );
      if (epoch !== this.epoch) return;
      done.scale = 1;
      this.leaving.delete(mover);
    }
    this.changed();
  }

  /** Lifts the piece on `square` to be carried by the pointer; false if there is none. */
  pickUp(square: Square): boolean {
    const figure = this.figures.get(square);
    if (!figure) return false;
    figure.lift = CARRY_LIFT;
    this.changed();
    return true;
  }

  /** Moves a carried piece to a board point. */
  carry(square: Square, at: BoardPoint): void {
    const figure = this.figures.get(square);
    if (!figure) return;
    figure.x = at.x;
    figure.z = at.z;
    this.changed();
  }

  /** Puts a carried piece back on its own square, gliding there. */
  async putBack(square: Square): Promise<void> {
    const figure = this.figures.get(square);
    if (!figure) return;
    const epoch = this.epoch;
    const start = { x: figure.x, z: figure.z, lift: figure.lift };
    const home = squareToWorld(square);
    await this.tweener.run(
      0.18,
      (t) => {
        if (epoch !== this.epoch) return;
        figure.x = start.x + (home.x - start.x) * t;
        figure.z = start.z + (home.z - start.z) * t;
        figure.lift = start.lift * (1 - t);
        this.changed();
      },
      easeOutCubic,
    );
    if (epoch === this.epoch) this.place(figure, square);
  }

  /** The pieces and where they are drawn, in the form the consistency check reads. */
  snapshot(): FlatSnapshot {
    const pieces: Partial<Record<Square, string>> = {};
    const positions: Partial<Record<Square, { x: number; y: number; z: number }>> = {};
    for (const [square, figure] of this.figures) {
      pieces[square] = pieceCode(figure);
      positions[square] = { x: figure.x, y: figure.lift, z: figure.z };
    }
    return { pieces, positions, meshCount: this.figures.size + this.leaving.size };
  }

  private travel(
    figure: FlatFigure,
    from: Square,
    to: Square,
    knight: boolean,
    epoch: number,
  ): Promise<void> {
    const follow = this.settings().followPath;
    const path = buildPath(from, to, {
      mode: follow ? 'follow' : 'glide',
      knight,
      // A piece taking its real route rises over the pieces in its way.
      heightAt: (square) => {
        const other = this.figures.get(square);
        return other && other !== figure ? 0.4 : 0;
      },
    });
    const seconds = follow
      ? SECONDS_PER_SQUARE * path.length + 0.15
      : Math.min(0.65, 0.3 + 0.05 * path.length + (knight ? 0.1 : 0));
    return this.tweener.run(
      seconds,
      (t) => {
        if (epoch !== this.epoch) return;
        const p = path.at(t);
        figure.x = p.x;
        figure.z = p.z;
        figure.lift = p.y;
        this.changed();
      },
      follow ? easeTrapezoid(0.18) : easeInOutCubic,
    );
  }

  /** A carried piece let go over its target settles onto the square. */
  private settle(figure: FlatFigure, to: Square, from: BoardPoint, epoch: number): Promise<void> {
    const target = squareToWorld(to);
    const lift = figure.lift;
    return this.tweener.run(
      0.14,
      (t) => {
        if (epoch !== this.epoch) return;
        figure.x = from.x + (target.x - from.x) * t;
        figure.z = from.z + (target.z - from.z) * t;
        figure.lift = lift * (1 - t);
        this.changed();
      },
      easeOutCubic,
    );
  }

  private place(figure: FlatFigure, square: Square): void {
    const home = squareToWorld(square);
    figure.x = home.x;
    figure.z = home.z;
    figure.lift = 0;
    figure.scale = 1;
  }

  private snapAll(): void {
    for (const [square, figure] of this.figures) this.place(figure, square);
    this.changed();
  }
}
