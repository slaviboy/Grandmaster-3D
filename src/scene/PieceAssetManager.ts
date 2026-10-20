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

// Loads the twelve Blender-made GLBs once and hands out piece meshes. Both sides of a piece type
// share one geometry (the files carry identical shapes; that is checked on load), and every mesh
// gets its own wood material so each piece's grain differs.

import { Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COLOR_NAMES, PIECE_NAMES, type Color, type PieceKind } from '../game/types.ts';
import { attachContactBlob, detachContactBlob, type GlassOptions } from './glass.ts';
import { createPieceMaterial } from './pieceMaterial.ts';
import { pieceTheme, type PieceStyle, type PieceTheme } from './themes.ts';

const KINDS: readonly PieceKind[] = ['p', 'n', 'b', 'r', 'q', 'k'];

export class PieceAssetManager {
  private readonly geometries = new Map<PieceKind, BufferGeometry>();
  private created = 0;
  private theme: PieceTheme = pieceTheme('classic');
  private glass: GlassOptions = { transmission: true };

  /** Loads every model; rejects with a readable message if any file is missing or malformed. */
  async load(baseUrl: string, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const jobs = KINDS.flatMap((kind) => (['w', 'b'] as const).map((color) => ({ kind, color })));
    let loaded = 0;
    const results = await Promise.all(
      jobs.map(async ({ kind, color }) => {
        const url = `${baseUrl}models/chess/${COLOR_NAMES[color]}-${PIECE_NAMES[kind]}.glb`;
        let geometry: BufferGeometry | null = null;
        try {
          const gltf = await loader.loadAsync(url);
          gltf.scene.traverse((node) => {
            if (!geometry && (node as Mesh).isMesh) geometry = (node as Mesh).geometry;
          });
        } catch (error) {
          throw new Error(`Could not load ${url}: ${(error as Error).message}`, { cause: error });
        }
        if (!geometry) throw new Error(`${url} contains no mesh`);
        onProgress?.(++loaded, jobs.length);
        return { kind, color, geometry: geometry as BufferGeometry };
      }),
    );

    for (const kind of KINDS) {
      const white = results.find((r) => r.kind === kind && r.color === 'w')!.geometry;
      const black = results.find((r) => r.kind === kind && r.color === 'b')!.geometry;
      const count = (g: BufferGeometry) => g.getAttribute('position').count;
      if (count(white) !== count(black)) {
        throw new Error(`white and black ${PIECE_NAMES[kind]} models differ`);
      }
      black.dispose();
      white.computeBoundingBox();
      // Stand the piece on y = 0 with its axis on the origin, whatever the exporter did.
      const box = white.boundingBox!;
      if (Math.abs(box.min.y) > 1e-4) white.translate(0, -box.min.y, 0);
      white.computeBoundingSphere();
      this.geometries.set(kind, white);
    }
  }

  get ready(): boolean {
    return this.geometries.size === KINDS.length;
  }

  /** Height of a piece type in squares. */
  height(kind: PieceKind): number {
    return this.geometry(kind).boundingBox?.max.y ?? 1;
  }

  /** The piece set new pieces are made in (promotions included). */
  setTheme(theme: PieceTheme): void {
    this.theme = theme;
  }

  get currentTheme(): PieceTheme {
    return this.theme;
  }

  style(color: Color): PieceStyle {
    return this.theme[color];
  }

  /** Whether clear glass refracts for real (costlier) or uses the cheaper see-through look. */
  setGlassOptions(options: GlassOptions): void {
    this.glass = options;
  }

  /** A fresh material in the current set for one side. */
  material(color: Color) {
    return createPieceMaterial(this.theme[color], ++this.created, this.glass);
  }

  /**
   * Shadows to match the finish: clear glass gets a soft contact blob instead of a solid shadow,
   * everything else casts a normal shadow.
   */
  dressShadow(mesh: Mesh, color: Color, kind: PieceKind): void {
    const clear = this.theme[color].finish === 'glass';
    mesh.castShadow = !clear;
    if (clear) {
      const box = this.geometry(kind).boundingBox;
      attachContactBlob(mesh, box ? Math.max(box.max.x, box.max.z) : 0.3);
    } else {
      detachContactBlob(mesh);
    }
  }

  create(color: Color, kind: PieceKind): Mesh {
    const mesh = new Mesh(this.geometry(kind), this.material(color));
    mesh.receiveShadow = true;
    mesh.name = `${COLOR_NAMES[color]}-${PIECE_NAMES[kind]}`;
    this.dressShadow(mesh, color, kind);
    return mesh;
  }

  /** Frees a mesh's own material (and any contact blob); the shared geometry stays. */
  release(mesh: Mesh): void {
    detachContactBlob(mesh);
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  }

  private geometry(kind: PieceKind): BufferGeometry {
    const geometry = this.geometries.get(kind);
    if (!geometry) throw new Error('piece models are not loaded yet');
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
  }
}
