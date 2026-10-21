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

// The marks on the 3D board (see markPainter.ts), painted on one transparent canvas laid just
// above the playing surface and redrawn only when a mark changes.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { paintMarks, type HighlightState } from './markPainter.ts';

export type { HighlightState } from './markPainter.ts';

const SIZE = 1024;

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

  private redraw(): void {
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    paintMarks(this.ctx, this.state, { showLegal: this.showLegal, showLast: this.showLast }, SIZE);
    this.texture.needsUpdate = true;
    this.requestRender();
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
