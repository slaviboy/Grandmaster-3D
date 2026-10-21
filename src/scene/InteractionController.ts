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

// Turns pointer and keyboard input on the board into move requests. Click a piece to select it
// (legal squares light up), then click a square; or drag the piece and drop it. Touch works the
// same through pointer events. Shift+arrows move a square cursor and Enter selects or moves, so the
// plain arrows stay with the camera as in the original game. The rules decide: a rejected move
// puts the piece straight back.

import { Plane, Raycaster, Vector3, type Mesh, type PerspectiveCamera } from 'three';
import type { MoveInput } from '../game/ChessGame.ts';
import type { CameraController } from './CameraController.ts';
import {
  squareFromIndices,
  squareIndices,
  squareToWorld,
  worldToSquare,
  type Square,
} from './coords.ts';
import type { Highlights } from './Highlights.ts';
import type { PieceManager } from './PieceManager.ts';
import { easeOutCubic, type Tweener } from './animation/tween.ts';

export interface InteractionRules {
  canPick(square: Square): boolean;
  legalTargets(square: Square): Square[];
  isCapture(from: Square, to: Square): boolean;
  /** Plays the move if legal; resolves false if it was refused. `dropped` marks a drag. */
  move(input: MoveInput, dropped?: Vector3): Promise<boolean>;
}

const DRAG_THRESHOLD = 5;
const LIFT = 0.45;

interface Press {
  readonly pointerId: number;
  readonly square: Square;
  readonly x: number;
  readonly y: number;
  dragging: boolean;
  readonly wasSelected: boolean;
}

export class InteractionController {
  private enabled = false;
  private suspended = false;
  private selected: Square | null = null;
  private press: Press | null = null;
  private cursor: Square | null = null;
  private busy = false;
  private readonly raycaster = new Raycaster();
  private readonly boardPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly liftPlane = new Plane(new Vector3(0, 1, 0), -LIFT);

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly cameraController: CameraController,
    private readonly pieces: PieceManager,
    private readonly highlights: Highlights,
    private readonly tweener: Tweener,
    private readonly rules: InteractionRules,
    private readonly requestRender: () => void,
  ) {
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * While the 3D board is hidden it lets go of any selection and ignores the keyboard (the canvas
   * gets no pointer events while hidden).
   */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (suspended) {
      this.cancelDrag();
      this.select(null);
      this.setCursor(null);
    }
  }

  /** Whether the player may pick pieces right now; turning it off clears any selection. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelDrag();
      this.select(null);
    }
  }

  /** The square under a client point: the piece hit first, else the board square. */
  squareAt(clientX: number, clientY: number): Square | null {
    this.raycaster.setFromCamera(this.cameraController.toNdc(clientX, clientY), this.camera);
    const meshes = this.pieces.meshes.filter((m) => m !== this.draggedMesh());
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) {
      const square = this.pieces.squareOf(hit.object as Mesh);
      if (square) return square;
    }
    const point = this.raycaster.ray.intersectPlane(this.boardPlane, new Vector3());
    return point ? worldToSquare(point.x, point.z) : null;
  }

  /** True when a client point lies on a piece or a square, so the camera leaves it alone. */
  isOverBoard(clientX: number, clientY: number): boolean {
    return this.squareAt(clientX, clientY) !== null;
  }

  private draggedMesh(): Mesh | undefined {
    return this.press?.dragging ? this.pieces.get(this.press.square)?.mesh : undefined;
  }

  private select(square: Square | null): void {
    this.selected = square;
    if (!square) {
      this.highlights.set({
        selected: undefined,
        targets: [],
        captures: [],
        dropTarget: undefined,
      });
      return;
    }
    const targets = this.rules.legalTargets(square);
    this.highlights.set({
      selected: square,
      targets,
      captures: targets.filter((t) => this.rules.isCapture(square, t)),
    });
  }

  private async request(from: Square, to: Square, dropped?: Vector3): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.select(null);
    try {
      const accepted = await this.rules.move({ from, to }, dropped);
      if (!accepted) {
        await this.returnHome(from);
        if (this.enabled && this.rules.canPick(from)) this.select(from);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Slides a piece that was dragged away back onto its square. */
  private async returnHome(square: Square): Promise<void> {
    const view = this.pieces.get(square);
    if (!view) return;
    const home = squareToWorld(square);
    const start = view.mesh.position.clone();
    if (start.distanceTo(new Vector3(home.x, 0, home.z)) < 1e-3) return;
    await this.tweener.run(
      0.18,
      (t) =>
        view.mesh.position.set(
          start.x + (home.x - start.x) * t,
          start.y * (1 - t),
          start.z + (home.z - start.z) * t,
        ),
      easeOutCubic,
    );
    this.pieces.placeMesh(view.mesh, square);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.busy || this.cameraController.dragging) return;
    const square = this.squareAt(event.clientX, event.clientY);
    if (!square) {
      this.select(null);
      return;
    }
    if (!this.enabled) return;
    this.setCursor(null);
    if (
      this.selected &&
      this.selected !== square &&
      this.rules.legalTargets(this.selected).includes(square)
    ) {
      void this.request(this.selected, square);
      return;
    }
    if (this.rules.canPick(square)) {
      const wasSelected = this.selected === square;
      this.select(square);
      this.press = {
        pointerId: event.pointerId,
        square,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        wasSelected,
      };
      this.dom.setPointerCapture(event.pointerId);
      event.preventDefault();
    } else {
      this.select(null);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) {
      if (event.pointerType === 'mouse' && event.buttons === 0 && !this.cameraController.cursor)
        this.updateHoverCursor(event);
      return;
    }
    if (
      !press.dragging &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD
    )
      return;
    press.dragging = true;
    this.dom.style.cursor = 'grabbing';
    const view = this.pieces.get(press.square);
    if (!view) return;
    this.raycaster.setFromCamera(
      this.cameraController.toNdc(event.clientX, event.clientY),
      this.camera,
    );
    const point = this.raycaster.ray.intersectPlane(this.liftPlane, new Vector3());
    if (!point) return;
    view.mesh.position.set(clampBoard(point.x), LIFT, clampBoard(point.z));
    const over = worldToSquare(point.x, point.z);
    const legal = over && this.rules.legalTargets(press.square).includes(over) ? over : undefined;
    if (legal !== this.highlights.current.dropTarget) this.highlights.set({ dropTarget: legal });
    this.requestRender();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.press = null;
    if (this.dom.hasPointerCapture(event.pointerId))
      this.dom.releasePointerCapture(event.pointerId);
    this.dom.style.cursor = '';
    this.highlights.set({ dropTarget: undefined });
    if (!press.dragging) {
      // A second click on the selected piece puts it down again.
      if (press.wasSelected) this.select(null);
      return;
    }
    const view = this.pieces.get(press.square);
    const position = view?.mesh.position.clone();
    const target = position ? worldToSquare(position.x, position.z) : null;
    if (target && target !== press.square && position) {
      void this.request(press.square, target, position);
    } else {
      void this.returnHome(press.square);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.press?.pointerId === event.pointerId) this.cancelDrag();
  };

  private cancelDrag(): void {
    const press = this.press;
    this.press = null;
    if (press?.dragging) void this.returnHome(press.square);
  }

  private updateHoverCursor(event: PointerEvent): void {
    if (!this.enabled) {
      this.dom.style.cursor = '';
      return;
    }
    const square = this.squareAt(event.clientX, event.clientY);
    const pickable =
      square &&
      (this.rules.canPick(square) ||
        (this.selected && this.rules.legalTargets(this.selected).includes(square)));
    this.dom.style.cursor = pickable ? 'pointer' : '';
  }

  private setCursor(square: Square | null): void {
    this.cursor = square;
    this.highlights.set({ cursor: square ?? undefined });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.suspended) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [role="menu"], dialog')) return;
    if (event.key === 'Escape') {
      this.select(null);
      this.setCursor(null);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const step = arrows[event.key];
    if (step && event.shiftKey) {
      event.preventDefault();
      // Directions follow the viewer: from Black's side "up" goes toward rank 1.
      const flip = this.cameraController.side === 'black' ? -1 : 1;
      const from = this.cursor ?? this.selected ?? (flip > 0 ? 'e2' : 'e7');
      const { file, rank } = squareIndices(from);
      const next = this.cursor
        ? squareFromIndices(file + step[0] * flip, rank + step[1] * flip)
        : from;
      if (next) this.setCursor(next);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.cursor && this.enabled) {
      event.preventDefault();
      const square = this.cursor;
      if (this.selected && this.rules.legalTargets(this.selected).includes(square)) {
        void this.request(this.selected, square);
      } else if (this.rules.canPick(square)) {
        this.select(this.selected === square ? null : square);
      }
    }
  };

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

function clampBoard(v: number): number {
  return Math.max(-4.3, Math.min(4.3, v));
}
