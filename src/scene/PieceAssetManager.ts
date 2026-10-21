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

// Loads the twelve Blender-made GLBs of a carved set once and hands out piece meshes. Both sides of
// a piece type share one geometry (the files carry identical shapes; that is checked on load), and
// every mesh gets its own wood material so each piece's grain differs. The Staunton set loads at
// start; another set (the Bell set) loads the first time a piece theme asks for it.

import { Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COLOR_NAMES, PIECE_NAMES, type Color, type PieceKind } from '../game/types.ts';
import { attachContactBlob, detachContactBlob, type GlassOptions } from './glass.ts';
import { createPieceMaterial } from './pieceMaterial.ts';
import { pieceTheme, type PieceShape, type PieceStyle, type PieceTheme } from './themes.ts';

const KINDS: readonly PieceKind[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** Folder of each set under models/chess/. */
export const SHAPE_FOLDERS: Record<PieceShape, string> = { staunton: '', bell: 'bell/' };

type GeometrySet = Map<PieceKind, BufferGeometry>;

/**
 * How a piece stands when it is not moving, as a turn about the vertical axis. The knight models
 * look along -x (toward the a-file); on the board each knight looks at its opponent instead, White's
 * toward Black (-z) and Black's toward White (+z). The other pieces look the same from every side.
 */
export function restingYaw(color: Color, kind: PieceKind): number {
  if (kind !== 'n') return 0;
  return color === 'w' ? -Math.PI / 2 : Math.PI / 2;
}

export class PieceAssetManager {
  private readonly sets = new Map<PieceShape, GeometrySet>();
  private readonly loading = new Map<PieceShape, Promise<GeometrySet>>();
  /** The set new and restyled pieces are carved in; it changes once the wanted set has loaded. */
  private shape: PieceShape = 'staunton';
  private baseUrl: string | null = null;
  private created = 0;
  private theme: PieceTheme = pieceTheme('classic');
  private glass: GlassOptions = { transmission: true };

  /**
   * Loads the models of the current theme's set; rejects with a readable message if a file is
   * missing or malformed. If another set than Staunton fails, it falls back to Staunton.
   */
  async load(baseUrl: string, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    this.baseUrl = baseUrl;
    const wanted = this.wantedShape;
    try {
      await this.fetchSet(wanted, onProgress);
      if (wanted === this.wantedShape || !this.ready) this.shape = wanted;
    } catch (error) {
      if (wanted === 'staunton') throw error;
      console.warn(`${wanted} pieces unavailable, using Staunton:`, (error as Error).message);
      await this.fetchSet('staunton', onProgress);
      this.shape = 'staunton';
    }
  }

  get ready(): boolean {
    return this.sets.has(this.shape);
  }

  /** The carved set pieces currently use. */
  get currentShape(): PieceShape {
    return this.shape;
  }

  /** Height of a piece type in squares. */
  height(kind: PieceKind): number {
    return this.geometry(kind).boundingBox?.max.y ?? 1;
  }

  private get wantedShape(): PieceShape {
    return this.theme.shape ?? 'staunton';
  }

  /** Loads one set once; concurrent callers share the request, and a failed load can be retried. */
  private fetchSet(
    shape: PieceShape,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<GeometrySet> {
    let job = this.loading.get(shape);
    if (!job) {
      job = loadSet(this.baseUrl ?? '', shape, onProgress).then(
        (set) => {
          this.sets.set(shape, set);
          return set;
        },
        (error: unknown) => {
          this.loading.delete(shape);
          throw error;
        },
      );
      this.loading.set(shape, job);
    }
    return job;
  }

  /**
   * The piece set new pieces are made in (promotions included). Materials follow at once; if the
   * set is carved differently, the returned promise resolves once those models are loaded and in
   * use. Restyle the pieces after it. A set that fails to load keeps the current models.
   */
  async setTheme(theme: PieceTheme): Promise<void> {
    this.theme = theme;
    if (this.baseUrl === null) return; // load() has not run yet; it picks the set.
    const wanted = this.wantedShape;
    try {
      await this.fetchSet(wanted);
    } catch (error) {
      console.warn(
        `${wanted} pieces unavailable, keeping ${this.shape}:`,
        (error as Error).message,
      );
      return;
    }
    if (wanted === this.wantedShape) this.shape = wanted;
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
    mesh.userData.restYaw = restingYaw(color, kind);
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

  /** The shared geometry of a piece type in the current set (tagged with its set in userData). */
  geometry(kind: PieceKind): BufferGeometry {
    const geometry = this.sets.get(this.shape)?.get(kind);
    if (!geometry) throw new Error('piece models are not loaded yet');
    return geometry;
  }

  dispose(): void {
    for (const set of this.sets.values()) for (const geometry of set.values()) geometry.dispose();
    this.sets.clear();
    this.loading.clear();
  }
}

async function loadSet(
  baseUrl: string,
  shape: PieceShape,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GeometrySet> {
  const loader = new GLTFLoader();
  const jobs = KINDS.flatMap((kind) => (['w', 'b'] as const).map((color) => ({ kind, color })));
  let loaded = 0;
  const results = await Promise.all(
    jobs.map(async ({ kind, color }) => {
      const file = `${COLOR_NAMES[color]}-${PIECE_NAMES[kind]}.glb`;
      const url = `${baseUrl}models/chess/${SHAPE_FOLDERS[shape]}${file}`;
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

  const set: GeometrySet = new Map();
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
    // The shatter effect picks the matching fragments by this tag.
    white.userData.shape = shape;
    set.set(kind, white);
  }
  return set;
}
