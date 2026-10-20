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

// The glass board: a thin clear sheet with rounded corners and a green-tinted edge, printed with
// frosted-white and glossy black squares and a double black line around them. The border stays
// clear, so the table shows through. Under the print lies a mirror, and the black squares let part
// of it through, so the pieces reflect in them as on a real glass board.

import {
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  type Texture,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { BoardTheme } from './themes.ts';
import type { FrameLabels } from './woodTextures.ts';

/** Thickness of the glass sheet, in squares. */
export const GLASS_THICKNESS = 0.12;
const FRAME_WIDTH = 0.5;
const CORNER_RADIUS = 0.12;
const BEVEL = 0.012;
/** How much of the mirror the black squares let through. */
const BLACK_ALPHA = 0.72;

export class GlassBoard {
  readonly group = new Group();
  readonly slab: Mesh;
  private readonly slabMaterial: MeshPhysicalMaterial;
  private readonly mirror: Reflector;
  private readonly squares: Mesh;
  private readonly squaresMaterial: MeshStandardMaterial;
  private readonly border: Mesh;
  private readonly borderMaterial: MeshStandardMaterial;
  private reflections = true;
  private labels: FrameLabels = { side: 'white', visible: true };
  private theme: BoardTheme | null = null;

  constructor(environment: Texture | null) {
    this.group.name = 'glass-board';

    this.slabMaterial = new MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: GLASS_THICKNESS,
      ior: 1.5,
      attenuationColor: new Color('#8fd1b4'),
      attenuationDistance: 0.6,
      specularIntensity: 1,
      envMapIntensity: 1.4,
    });
    if (environment) this.slabMaterial.envMap = environment;
    this.slab = new Mesh(createSlabGeometry(), this.slabMaterial);
    this.slab.name = 'glass-slab';
    this.slab.receiveShadow = true;

    this.mirror = new Reflector(new PlaneGeometry(8, 8), {
      textureWidth: 1024,
      textureHeight: 1024,
      color: new Color('#9a9a9a'),
      clipBias: 0.003,
    });
    this.mirror.name = 'glass-mirror';
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = -0.0006;

    this.squaresMaterial = new MeshStandardMaterial({
      transparent: true,
      roughness: 0.1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    if (environment) this.squaresMaterial.envMap = environment;
    this.squares = new Mesh(new PlaneGeometry(8, 8), this.squaresMaterial);
    this.squares.name = 'glass-squares';
    this.squares.rotation.x = -Math.PI / 2;
    this.squares.receiveShadow = true;

    this.borderMaterial = new MeshStandardMaterial({
      transparent: true,
      roughness: 0.2,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const span = 8 + 2 * FRAME_WIDTH;
    this.border = new Mesh(new PlaneGeometry(span, span), this.borderMaterial);
    this.border.name = 'glass-border-print';
    this.border.rotation.x = -Math.PI / 2;

    this.group.add(this.slab, this.mirror, this.squares, this.border);
  }

  /** y of the underside, where the sheet rests on the table. */
  get bottomY(): number {
    return -GLASS_THICKNESS;
  }

  setTheme(theme: BoardTheme): void {
    this.theme = theme;
    this.paint();
  }

  setLabels(labels: FrameLabels): void {
    this.labels = labels;
    this.paintBorder();
  }

  /** Real reflections in the black squares (costs a second render) or plain glossy black. */
  setReflections(on: boolean): void {
    if (on === this.reflections) return;
    this.reflections = on;
    this.mirror.visible = on;
    this.paintSquares();
  }

  private paint(): void {
    this.paintSquares();
    this.paintBorder();
  }

  private paintSquares(): void {
    if (!this.theme) return;
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cell = size / 8;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const light = (row + col) % 2 === 0;
        if (light) {
          ctx.fillStyle = this.theme.light.base;
        } else {
          const base = this.theme.dark.base;
          const r = Number.parseInt(base.slice(1, 3), 16);
          const g = Number.parseInt(base.slice(3, 5), 16);
          const b = Number.parseInt(base.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r},${g},${b},${this.reflections ? BLACK_ALPHA : 1})`;
        }
        ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
    // A faint frost on the white print.
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i]! > 200) {
        const n = (Math.random() - 0.5) * 6;
        image.data[i] = image.data[i]! + n;
        image.data[i + 1] = image.data[i + 1]! + n;
        image.data[i + 2] = image.data[i + 2]! + n;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.squaresMaterial.map?.dispose();
    this.squaresMaterial.map = toTexture(canvas);
    this.squaresMaterial.needsUpdate = true;
  }

  /** The clear border: a double black line around the squares and the coordinates. */
  private paintBorder(): void {
    if (!this.theme) return;
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const unit = size / (8 + 2 * FRAME_WIDTH);
    const strip = FRAME_WIDTH * unit;
    const ink = this.theme.dark.base;
    // Thick line close to the squares, thin line a little further out.
    ctx.fillStyle = ink;
    const ring = (from: number, width: number) => {
      const o = strip - from * unit;
      const w = width * unit;
      const inner = size - 2 * o;
      ctx.fillRect(o - w, o - w, inner + 2 * w, w);
      ctx.fillRect(o - w, size - o, inner + 2 * w, w);
      ctx.fillRect(o - w, o, w, inner);
      ctx.fillRect(size - o, o, w, inner);
    };
    ring(0.04, 0.05);
    ring(0.15, 0.022);

    if (this.labels.visible) {
      const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
      ctx.font = `500 ${unit * 0.22}px "Trebuchet MS", "DejaVu Sans", Verdana, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.theme.labelColour;
      const at = strip * 0.38;
      const white = this.labels.side === 'white';
      for (let i = 0; i < 8; i++) {
        const fileX = strip + (i + 0.5) * unit;
        const rankY = size - strip - (i + 0.5) * unit;
        const put = (text: string, x: number, y: number, angle: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        };
        if (white) {
          put(files[i]!, fileX, size - at, 0);
          put(ranks[i]!, at, rankY, 0);
        } else {
          put(files[i]!, fileX, at, Math.PI);
          put(ranks[i]!, size - at, rankY, Math.PI);
        }
      }
    }
    this.borderMaterial.map?.dispose();
    this.borderMaterial.map = toTexture(canvas);
    this.borderMaterial.needsUpdate = true;
  }

  dispose(): void {
    this.slab.geometry.dispose();
    this.slabMaterial.dispose();
    this.mirror.dispose();
    this.squares.geometry.dispose();
    this.squaresMaterial.map?.dispose();
    this.squaresMaterial.dispose();
    this.border.geometry.dispose();
    this.borderMaterial.map?.dispose();
    this.borderMaterial.dispose();
  }
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createSlabGeometry(): ExtrudeGeometry {
  const half = 4 + FRAME_WIDTH - BEVEL;
  const r = CORNER_RADIUS;
  const shape = new Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  const depth = GLASS_THICKNESS - 2 * BEVEL;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2);
  // Top face just under the printed squares at y = 0.
  geometry.translate(0, -0.0012 - (depth + BEVEL), 0);
  geometry.computeVertexNormals();
  return geometry;
}
