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

// The wooden board: a rounded maple frame with engraved coordinates around a recessed 8x8 playing
// surface. Dimensions are in squares and were measured on the reference screenshots.

import {
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  type CanvasTexture,
  type Vector3,
} from 'three';
import { createFrameTexture, createSquaresTexture, type FrameLabels } from './woodTextures.ts';

/** Width of the frame around the playing area. */
export const FRAME_WIDTH = 0.5;
/** Total board thickness, frame top to underside. */
export const BOARD_THICKNESS = 0.3;
/** How far the frame top stands above the playing surface. */
export const FRAME_LIP = 0.015;
const CORNER_RADIUS = 0.26;
const BEVEL = 0.025;
/** Distance from a frame corner within which a drag rotates instead of pans. */
const CORNER_ZONE = 1.2;

export type FrameZone = 'corner' | 'edge';

export class ChessBoard {
  readonly group = new Group();
  readonly frame: Mesh;
  readonly surface: Mesh;
  /** y of the underside, where the board rests on the cloth. */
  readonly bottomY = FRAME_LIP - BOARD_THICKNESS;
  private readonly frameMaterial: MeshStandardMaterial;
  private labels: FrameLabels = { side: 'white', visible: true };

  constructor() {
    this.group.name = 'board';

    const squares = createSquaresTexture();
    const surfaceMaterial = new MeshStandardMaterial({
      map: squares,
      roughness: 0.55,
      metalness: 0,
    });
    this.surface = new Mesh(new PlaneGeometry(8, 8), surfaceMaterial);
    this.surface.name = 'playing-surface';
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.receiveShadow = true;

    this.frameMaterial = new MeshStandardMaterial({
      map: this.makeFrameTexture(),
      roughness: 0.5,
      metalness: 0,
    });
    this.frame = new Mesh(createFrameGeometry(), this.frameMaterial);
    this.frame.name = 'frame';
    this.frame.castShadow = true;
    this.frame.receiveShadow = true;

    this.group.add(this.surface, this.frame);
  }

  /** Puts the engraved coordinates on the side facing the given player. */
  setLabels(labels: Partial<FrameLabels>): void {
    const next = { ...this.labels, ...labels };
    if (next.side === this.labels.side && next.visible === this.labels.visible) return;
    this.labels = next;
    this.frameMaterial.map?.dispose();
    this.frameMaterial.map = this.makeFrameTexture();
    this.frameMaterial.needsUpdate = true;
  }

  /** Which drag zone of the frame a world-space point on the frame falls in. */
  frameZone(point: Vector3): FrameZone {
    const edge = 4 + FRAME_WIDTH;
    const nearX = edge - Math.abs(point.x) < CORNER_ZONE;
    const nearZ = edge - Math.abs(point.z) < CORNER_ZONE;
    return nearX && nearZ ? 'corner' : 'edge';
  }

  private makeFrameTexture(): CanvasTexture {
    const texture = createFrameTexture(FRAME_WIDTH, this.labels);
    // Extrude caps use shape coordinates (-4.5..4.5) as UVs; map them onto the 0..1 canvas.
    const span = 8 + 2 * FRAME_WIDTH;
    texture.repeat.set(1 / span, 1 / span);
    texture.offset.set(0.5, 0.5);
    return texture;
  }

  dispose(): void {
    this.frame.geometry.dispose();
    this.surface.geometry.dispose();
    this.frameMaterial.map?.dispose();
    this.frameMaterial.dispose();
    const surfaceMaterial = this.surface.material as MeshStandardMaterial;
    surfaceMaterial.map?.dispose();
    surfaceMaterial.dispose();
  }
}

function roundedRect(shape: Shape | Path, half: number, radius: number): void {
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
}

function createFrameGeometry(): ExtrudeGeometry {
  const outer = new Shape();
  roundedRect(outer, 4 + FRAME_WIDTH - BEVEL, CORNER_RADIUS);
  const hole = new Path();
  // The hole is drawn clockwise and slightly larger than the playing area: the bevel narrows it
  // back to the square edge, so the frame lip just covers the surface border.
  const h = 4 + BEVEL;
  hole.moveTo(-h, -h);
  hole.lineTo(-h, h);
  hole.lineTo(h, h);
  hole.lineTo(h, -h);
  hole.lineTo(-h, -h);
  outer.holes.push(hole);

  const depth = BOARD_THICKNESS - 2 * BEVEL;
  const geometry = new ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // Shape XY becomes the board plane (shape +y = world -z, the rank-8 side), extrusion becomes up.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, FRAME_LIP - (depth + BEVEL), 0);
  geometry.computeVertexNormals();
  return geometry;
}
