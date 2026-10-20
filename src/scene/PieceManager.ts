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

// Keeps the 3D pieces in step with the logical board. Each occupied square maps to one piece view;
// sync() reconciles the scene with a board map by moving, adding and removing as little as possible.
// Animations move meshes temporarily, but this map always records where pieces logically stand.

import { Group, type Mesh } from 'three';
import { pieceCode, type BoardMap, type Color, type Piece, type PieceKind } from '../game/types.ts';
import { SQUARES, squareToWorld, type Square } from './coords.ts';
import type { PieceAssetManager } from './PieceAssetManager.ts';

export interface PieceView {
  readonly id: number;
  readonly mesh: Mesh;
  readonly color: Color;
  readonly kind: PieceKind;
}

export class PieceManager {
  readonly group = new Group();
  private readonly views = new Map<Square, PieceView>();
  private nextId = 1;

  constructor(private readonly assets: PieceAssetManager) {
    this.group.name = 'pieces';
  }

  get(square: Square): PieceView | undefined {
    return this.views.get(square);
  }

  /** Finds the square a mesh stands on (used by raycast picking). */
  squareOf(mesh: Mesh): Square | undefined {
    for (const [square, view] of this.views) if (view.mesh === mesh) return square;
    return undefined;
  }

  get meshes(): Mesh[] {
    return [...this.views.values()].map((v) => v.mesh);
  }

  /** Creates a piece on a square, replacing whatever stood there. */
  add(square: Square, piece: Piece): PieceView {
    this.remove(square);
    const mesh = this.assets.create(piece.color, piece.kind);
    const view: PieceView = { id: this.nextId++, mesh, color: piece.color, kind: piece.kind };
    this.views.set(square, view);
    this.group.add(mesh);
    this.placeMesh(mesh, square);
    return view;
  }

  remove(square: Square): void {
    const view = this.views.get(square);
    if (!view) return;
    this.views.delete(square);
    this.dispose(view);
  }

  /** Takes a piece off the map without destroying its mesh (for capture animations). */
  detach(square: Square): PieceView | undefined {
    const view = this.views.get(square);
    if (view) this.views.delete(square);
    return view;
  }

  /** Moves a piece's record to another square; the mesh moves only if `snap` is set. */
  relocate(from: Square, to: Square, snap = true): PieceView | undefined {
    const view = this.views.get(from);
    if (!view) return undefined;
    this.views.delete(from);
    this.remove(to);
    this.views.set(to, view);
    if (snap) this.placeMesh(view.mesh, to);
    return view;
  }

  dispose(view: PieceView): void {
    view.mesh.removeFromParent();
    this.assets.release(view.mesh);
  }

  /** Makes the scene match `board`: keeps pieces already right, reuses movable ones, adds the rest. */
  sync(board: BoardMap): void {
    const spare: PieceView[] = [];
    for (const square of SQUARES) {
      const view = this.views.get(square);
      const want = board[square];
      if (view && (!want || want.color !== view.color || want.kind !== view.kind)) {
        this.views.delete(square);
        spare.push(view);
      }
    }
    for (const square of SQUARES) {
      const want = board[square];
      if (!want || this.views.has(square)) continue;
      const index = spare.findIndex((v) => v.color === want.color && v.kind === want.kind);
      if (index >= 0) {
        const [view] = spare.splice(index, 1);
        this.views.set(square, view!);
        this.placeMesh(view!.mesh, square);
      } else {
        this.add(square, want);
      }
    }
    for (const view of spare) this.dispose(view);
    // Snap every piece home, in case an animation was interrupted.
    for (const [square, view] of this.views) this.placeMesh(view.mesh, square);
  }

  /** Gives every piece on the board a material from the asset manager's current set. */
  restyle(): void {
    for (const view of this.views.values()) {
      this.assets.release(view.mesh);
      // Geometry is shared per set, so swapping it frees nothing.
      view.mesh.geometry = this.assets.geometry(view.kind);
      view.mesh.material = this.assets.material(view.color);
      this.assets.dressShadow(view.mesh, view.color, view.kind);
    }
  }

  /** Compact description of the scene for consistency checks: square -> "wP" etc. */
  snapshot(): Partial<Record<Square, string>> {
    const out: Partial<Record<Square, string>> = {};
    for (const [square, view] of this.views) out[square] = pieceCode(view);
    return out;
  }

  /** Puts a mesh exactly on a square, upright and facing its default direction. */
  placeMesh(mesh: Mesh, square: Square): void {
    const { x, z } = squareToWorld(square);
    mesh.position.set(x, 0, z);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
  }

  clear(): void {
    for (const view of this.views.values()) this.dispose(view);
    this.views.clear();
  }
}
