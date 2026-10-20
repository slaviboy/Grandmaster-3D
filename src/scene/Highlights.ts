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

// Marks drawn on the board: thin white rings on the last move's squares (as in the reference), a
// light-blue selected square, dots for legal moves (rings on captures), a red glow under a king in
// check, hint rings, the keyboard cursor and the square a dragged piece would land on. Everything
// is painted on one transparent canvas laid just above the playing surface, redrawn only when a
// mark changes.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { squareIndices, type Square } from './coords.ts';

export interface HighlightState {
  readonly lastMove?: { readonly from: Square; readonly to: Square };
  readonly selected?: Square;
  readonly targets?: readonly Square[];
  /** Targets that capture, drawn as rings instead of dots. */
  readonly captures?: readonly Square[];
  readonly check?: Square;
  readonly hint?: { readonly from: Square; readonly to: Square };
  readonly cursor?: Square;
  readonly dropTarget?: Square;
}

const SIZE = 1024;
const CELL = SIZE / 8;

export class Highlights {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private state: HighlightState = {};
  private showLegal = true;
  private showLast = true;

  constructor(private readonly requestRender: () => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(new PlaneGeometry(8, 8), material);
    this.mesh.name = 'highlights';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.002;
    this.mesh.renderOrder = 1;
    this.redraw();
  }

  get current(): HighlightState {
    return this.state;
  }

  set(patch: Partial<HighlightState>): void {
    this.state = { ...this.state, ...patch };
    this.redraw();
  }

  setOptions(options: { showLegalMoves?: boolean; showLastMove?: boolean }): void {
    if (options.showLegalMoves !== undefined) this.showLegal = options.showLegalMoves;
    if (options.showLastMove !== undefined) this.showLast = options.showLastMove;
    this.redraw();
  }

  private centre(square: Square): [number, number] {
    const { file, rank } = squareIndices(square);
    return [(file + 0.5) * CELL, (7 - rank + 0.5) * CELL];
  }

  private ring(square: Square, colour: string, radius = 0.4, width = 0.055): void {
    const [x, y] = this.centre(square);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, radius * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * CELL;
    ctx.stroke();
  }

  private redraw(): void {
    const ctx = this.ctx;
    const s = this.state;
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (s.check) {
      const [x, y] = this.centre(s.check);
      const glow = ctx.createRadialGradient(x, y, CELL * 0.05, x, y, CELL * 0.62);
      glow.addColorStop(0, 'rgba(255,40,20,0.85)');
      glow.addColorStop(0.55, 'rgba(230,30,10,0.45)');
      glow.addColorStop(1, 'rgba(200,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - CELL, y - CELL, CELL * 2, CELL * 2);
    }

    if (s.selected) {
      const { file, rank } = squareIndices(s.selected);
      ctx.fillStyle = 'rgba(91,169,200,0.82)';
      ctx.fillRect(file * CELL, (7 - rank) * CELL, CELL, CELL);
    }

    if (s.dropTarget) {
      const { file, rank } = squareIndices(s.dropTarget);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = CELL * 0.06;
      ctx.strokeRect(
        file * CELL + CELL * 0.04,
        (7 - rank) * CELL + CELL * 0.04,
        CELL * 0.92,
        CELL * 0.92,
      );
    }

    if (this.showLast && s.lastMove) {
      this.ring(s.lastMove.from, 'rgba(255,255,255,0.9)');
      this.ring(s.lastMove.to, 'rgba(255,255,255,0.9)');
    }

    if (s.hint) {
      this.ring(s.hint.from, 'rgba(120,230,120,0.95)', 0.36, 0.07);
      this.ring(s.hint.to, 'rgba(120,230,120,0.95)', 0.36, 0.07);
    }

    if (this.showLegal && s.targets) {
      const captures = new Set(s.captures ?? []);
      for (const target of s.targets) {
        const [x, y] = this.centre(target);
        if (captures.has(target)) {
          this.ring(target, 'rgba(24,74,96,0.6)', 0.44, 0.075);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(24,74,96,0.5)';
          ctx.fill();
        }
      }
    }

    if (s.cursor) {
      const { file, rank } = squareIndices(s.cursor);
      ctx.setLineDash([CELL * 0.12, CELL * 0.08]);
      ctx.strokeStyle = 'rgba(255,230,120,0.95)';
      ctx.lineWidth = CELL * 0.05;
      ctx.strokeRect(
        file * CELL + CELL * 0.05,
        (7 - rank) * CELL + CELL * 0.05,
        CELL * 0.9,
        CELL * 0.9,
      );
      ctx.setLineDash([]);
    }

    this.texture.needsUpdate = true;
    this.requestRender();
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
