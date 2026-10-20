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

// Plays accepted moves on the 3D pieces. The piece map is updated first (it always holds the
// logical position) and then the meshes catch up. By default a piece glides to its square and a
// captured piece disappears as it lands, like an ordinary chess set. Two settings change that:
// "Follow move path" sends pieces along their real route (the knight in an L, lifting over pieces
// in the way) and "Demolish captures" shatters the captured piece into wooden fragments.
//
// Every move runs under an epoch. finishAll() bumps it, so an interrupted move stops touching the
// meshes and the board can be re-synced at once.

import type { Vector3 } from 'three';
import type { MoveRecord } from '../game/ChessGame.ts';
import { buildPath, type MovePath } from './animation/paths.ts';
import { easeInOutCubic, easeOutCubic, easeTrapezoid, type Tweener } from './animation/tween.ts';
import { squareToWorld, type Square } from './coords.ts';
import type { PieceAssetManager } from './PieceAssetManager.ts';
import type { PieceManager, PieceView } from './PieceManager.ts';

export interface AnimationSettings {
  readonly followPath: boolean;
  readonly demolish: boolean;
}

/** Takes over a captured piece's mesh and breaks it apart. */
export interface CaptureEffect {
  shatter(view: PieceView, direction: { x: number; z: number }): void;
  clear(): void;
}

const SECONDS_PER_SQUARE = 0.3;
const CONTACT_DISTANCE = 0.35;

export class AnimationController {
  private epoch = 0;
  private readonly orphans = new Set<PieceView>();
  effect: CaptureEffect | null = null;

  constructor(
    private readonly tweener: Tweener,
    private readonly pieces: PieceManager,
    private readonly assets: PieceAssetManager,
    private readonly settings: () => AnimationSettings,
  ) {}

  /** Animates a move; `dropped` is where a dragged piece was let go, if it was dragged. */
  async playMove(move: MoveRecord, dropped?: Vector3): Promise<void> {
    const epoch = this.epoch;
    const settings = this.settings();
    const mover = this.pieces.get(move.from);
    if (!mover) return;

    const victimSquare = move.enPassant
      ? (`${move.to[0]}${move.from[1]}` as Square)
      : move.capture
        ? move.to
        : null;
    const victim = victimSquare ? this.pieces.detach(victimSquare) : undefined;
    if (victim) this.orphans.add(victim);
    this.pieces.relocate(move.from, move.to, false);

    const onContact = victim ? () => this.capture(victim, move, settings) : undefined;
    if (dropped) {
      await this.dropInto(mover, move.to, dropped, onContact);
    } else {
      const path = buildPath(move.from, move.to, {
        mode: settings.followPath ? 'follow' : 'glide',
        knight: move.piece === 'n',
        heightAt: (square) => this.heightAt(square, mover),
      });
      await this.travel(
        mover,
        path,
        move.piece === 'n' && settings.followPath,
        settings.followPath,
        onContact,
      );
    }
    if (epoch !== this.epoch) return;
    if (victim && this.orphans.has(victim)) this.release(victim);
    this.pieces.placeMesh(mover.mesh, move.to);

    if (move.kingsideCastle || move.queensideCastle) {
      const rank = move.color === 'w' ? '1' : '8';
      const rookFrom = `${move.kingsideCastle ? 'h' : 'a'}${rank}` as Square;
      const rookTo = `${move.kingsideCastle ? 'f' : 'd'}${rank}` as Square;
      const rook = this.pieces.relocate(rookFrom, rookTo, false);
      if (rook) {
        const path = buildPath(rookFrom, rookTo, {
          mode: settings.followPath ? 'follow' : 'glide',
          knight: false,
          heightAt: (square) => this.heightAt(square, rook),
        });
        await this.travel(rook, path, false, settings.followPath);
        if (epoch !== this.epoch) return;
        this.pieces.placeMesh(rook.mesh, rookTo);
      }
    }

    if (move.promotion) await this.promote(move, epoch);
  }

  /** Ends whatever is running and lets the caller re-sync the board. */
  finishAll(): void {
    this.epoch++;
    this.tweener.finishAll();
    for (const view of this.orphans) this.pieces.dispose(view);
    this.orphans.clear();
  }

  private heightAt(square: Square, mover: PieceView): number {
    const view = this.pieces.get(square);
    return view && view !== mover ? this.assets.height(view.kind) : 0;
  }

  private capture(victim: PieceView, move: MoveRecord, settings: AnimationSettings): void {
    if (!this.orphans.has(victim)) return;
    if (settings.demolish && this.effect) {
      const from = squareToWorld(move.from);
      const to = squareToWorld(move.to);
      const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      this.orphans.delete(victim);
      this.effect.shatter(victim, { x: (to.x - from.x) / length, z: (to.z - from.z) / length });
    } else {
      // The ordinary way: the captured piece is simply gone when the mover lands.
      this.release(victim);
    }
  }

  private release(view: PieceView): void {
    this.orphans.delete(view);
    this.pieces.dispose(view);
  }

  private travel(
    view: PieceView,
    path: MovePath,
    turnToFace: boolean,
    follow: boolean,
    onContact?: () => void,
  ): Promise<void> {
    const mesh = view.mesh;
    const seconds = follow
      ? SECONDS_PER_SQUARE * path.length + 0.15
      : Math.min(0.65, 0.3 + 0.05 * path.length + (view.kind === 'n' ? 0.1 : 0));
    const contactAt = path.length > 0 ? Math.max(0, 1 - CONTACT_DISTANCE / path.length) : 1;
    // With the regular glide the victim vanishes on landing; when demolishing, at contact.
    const triggerAt = this.settings().demolish ? contactAt : 1;
    let contacted = false;
    return this.tweener.run(
      seconds,
      (t) => {
        const p = path.at(t);
        mesh.position.set(p.x, p.y, p.z);
        if (turnToFace) {
          // The knight model looks along -x; turn it to face each leg of its route and settle
          // back to its usual facing at the end.
          const dir = path.heading(t);
          const yaw = Math.atan2(dir.z, -dir.x);
          const weight = smooth(Math.min(1, t / 0.12)) * (1 - smooth(Math.max(0, (t - 0.8) / 0.2)));
          mesh.rotation.y = wrapAngle(yaw) * weight;
        }
        if (!contacted && onContact && t >= triggerAt) {
          contacted = true;
          onContact();
        }
      },
      follow ? easeTrapezoid(0.18) : easeInOutCubic,
    );
  }

  private dropInto(
    view: PieceView,
    square: Square,
    from: Vector3,
    onContact?: () => void,
  ): Promise<void> {
    const target = squareToWorld(square);
    const start = from.clone();
    const mesh = view.mesh;
    return this.tweener.run(
      0.14,
      (t) => {
        mesh.position.set(
          start.x + (target.x - start.x) * t,
          start.y * (1 - t),
          start.z + (target.z - start.z) * t,
        );
        if (t >= 1) onContact?.();
      },
      easeOutCubic,
    );
  }

  private async promote(move: MoveRecord, epoch: number): Promise<void> {
    const pawn = this.pieces.detach(move.to);
    if (!pawn || !move.promotion) return;
    this.orphans.add(pawn);
    const queen = this.pieces.add(move.to, { color: move.color, kind: move.promotion });
    queen.mesh.scale.setScalar(0.01);
    await this.tweener.run(
      0.3,
      (t) => {
        pawn.mesh.scale.setScalar(Math.max(0.001, 1 - t));
        // A small overshoot makes the new piece pop into place.
        const s = t < 0.75 ? (t / 0.75) * 1.12 : 1.12 - ((t - 0.75) / 0.25) * 0.12;
        queen.mesh.scale.setScalar(Math.max(0.001, s));
      },
      (t) => t,
    );
    if (epoch !== this.epoch) return;
    queen.mesh.scale.setScalar(1);
    this.release(pawn);
  }
}

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
