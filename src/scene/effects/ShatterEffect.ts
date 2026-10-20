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

// "Demolish captures": the captured piece bursts into the wooden chunks pre-fractured in Blender
// (blender/scripts/fracture.py). Chunks fly off along the attacker's direction with some spread and
// spin, fall, bounce on the board or drop to the cloth, then fade and are freed after two seconds.
// A few lines of physics do it; there is no physics engine. The effect is purely visual: the
// rules and the piece map have already moved on.

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRng, range, type Rng } from '../../core/rng.ts';
import { PIECE_NAMES, type PieceKind } from '../../game/types.ts';
import type { CaptureEffect } from '../AnimationController.ts';
import type { PieceView } from '../PieceManager.ts';

interface ChunkTemplate {
  /** Centre of the chunk relative to the piece's base. */
  readonly offset: Vector3;
  readonly parts: ReadonlyArray<{ readonly geometry: BufferGeometry; readonly inner: boolean }>;
  readonly radius: number;
}

interface Chunk {
  readonly object: Group;
  readonly velocity: Vector3;
  readonly spin: Vector3;
  readonly radius: number;
  resting: boolean;
}

interface Burst {
  readonly root: Group;
  readonly chunks: Chunk[];
  readonly materials: Material[];
  age: number;
}

const GRAVITY = 22;
const LIFETIME = 2;
const FADE_FROM = 1.3;
const MAX_BURSTS = 4;
/** Height of the cloth the board rests on, relative to the playing surface. */
const CLOTH_Y = -0.285;

/** Loads the fragment models: one GLB per piece type, one node per chunk. */
export class FragmentLibrary {
  private readonly templates = new Map<PieceKind, ChunkTemplate[]>();

  async load(baseUrl: string): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      (Object.keys(PIECE_NAMES) as PieceKind[]).map(async (kind) => {
        const gltf = await loader.loadAsync(
          `${baseUrl}models/chess/fragments/${PIECE_NAMES[kind]}.glb`,
        );
        const chunks: ChunkTemplate[] = [];
        const root = gltf.scene.children[0] ?? gltf.scene;
        for (const node of root.children) {
          const parts: Array<{ geometry: BufferGeometry; inner: boolean }> = [];
          node.traverse((child: Object3D) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            const material = mesh.material as Material;
            parts.push({ geometry: mesh.geometry, inner: material.name === 'end_grain' });
          });
          if (parts.length === 0) continue;
          let radius = 0;
          for (const part of parts) {
            part.geometry.computeBoundingSphere();
            radius = Math.max(radius, part.geometry.boundingSphere?.radius ?? 0);
          }
          chunks.push({ offset: node.position.clone(), parts, radius });
        }
        this.templates.set(kind, chunks);
      }),
    );
  }

  get(kind: PieceKind): ChunkTemplate[] | undefined {
    return this.templates.get(kind);
  }
}

export class ShatterEffect implements CaptureEffect {
  readonly group = new Group();
  private readonly bursts: Burst[] = [];
  private readonly rng: Rng;
  private readonly spinStep = new Quaternion();
  private readonly axis = new Vector3();

  constructor(
    private readonly library: FragmentLibrary,
    seed = 99,
    private readonly onBreak?: () => void,
  ) {
    this.group.name = 'effects';
    this.rng = createRng(seed);
  }

  get active(): boolean {
    return this.bursts.length > 0;
  }

  /** Whether fragments for a piece type are available. */
  canShatter(kind: PieceKind): boolean {
    return !!this.library.get(kind)?.length;
  }

  shatter(view: PieceView, direction: { x: number; z: number }): void {
    const templates = this.library.get(view.kind);
    const source = view.mesh;
    source.removeFromParent();
    if (!templates?.length) {
      (source.material as Material).dispose();
      return;
    }
    while (this.bursts.length >= MAX_BURSTS) this.dispose(this.bursts.shift()!);

    const outer = source.material as Material;
    const inner = new MeshStandardMaterial({ color: '#dcbb92', roughness: 0.85, metalness: 0 });
    const root = new Group();
    root.position.copy(source.position);
    root.rotation.copy(source.rotation);
    const chunks: Chunk[] = [];
    const rng = this.rng;
    for (const template of templates) {
      const object = new Group();
      object.position.copy(template.offset);
      for (const part of template.parts) {
        const mesh = new Mesh(part.geometry, part.inner ? inner : outer);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        object.add(mesh);
      }
      // Burst away from the attacker, spreading outward from the piece's axis and upward.
      const outward = new Vector3(template.offset.x, 0, template.offset.z);
      if (outward.lengthSq() < 1e-6) outward.set(range(rng, -1, 1), 0, range(rng, -1, 1));
      outward.normalize();
      const push = range(rng, 1.6, 3.2);
      const height = template.offset.y;
      const velocity = new Vector3(
        direction.x * push + outward.x * range(rng, 0.6, 1.8),
        range(rng, 2.2, 4.4) + height * 0.8,
        direction.z * push + outward.z * range(rng, 0.6, 1.8),
      );
      const spin = new Vector3(range(rng, -12, 12), range(rng, -12, 12), range(rng, -12, 12));
      root.add(object);
      chunks.push({ object, velocity, spin, radius: template.radius * 0.55, resting: false });
    }
    this.group.add(root);
    this.bursts.push({ root, chunks, materials: [outer, inner], age: 0 });
    this.onBreak?.();
  }

  /** Steps the fragments; returns true while any are still visible. */
  update(delta: number): boolean {
    const dt = Math.min(delta, 1 / 30);
    for (const burst of [...this.bursts]) {
      burst.age += delta;
      for (const chunk of burst.chunks) this.step(burst.root, chunk, dt);
      if (burst.age > FADE_FROM) {
        const opacity = Math.max(0, 1 - (burst.age - FADE_FROM) / (LIFETIME - FADE_FROM));
        for (const material of burst.materials) {
          material.transparent = true;
          material.opacity = opacity;
          material.depthWrite = opacity > 0.5;
        }
      }
      if (burst.age >= LIFETIME) {
        this.dispose(burst);
        this.bursts.splice(this.bursts.indexOf(burst), 1);
      }
    }
    return this.bursts.length > 0;
  }

  private step(root: Group, chunk: Chunk, dt: number): void {
    if (chunk.resting) return;
    const o = chunk.object;
    chunk.velocity.y -= GRAVITY * dt;
    o.position.addScaledVector(chunk.velocity, dt);
    const speed = chunk.spin.length();
    if (speed > 1e-3) {
      this.axis.copy(chunk.spin).divideScalar(speed);
      this.spinStep.setFromAxisAngle(this.axis, speed * dt);
      o.quaternion.premultiply(this.spinStep);
    }
    // Floor: the board top within the frame, the cloth beyond it (positions are relative to the
    // captured piece's square, so convert to board coordinates first).
    const x = o.position.x + root.position.x;
    const z = o.position.z + root.position.z;
    const floor = Math.abs(x) <= 4.5 && Math.abs(z) <= 4.5 ? 0.015 : CLOTH_Y;
    if (o.position.y - chunk.radius < floor && chunk.velocity.y < 0) {
      o.position.y = floor + chunk.radius;
      chunk.velocity.y *= -0.32;
      chunk.velocity.x *= 0.7;
      chunk.velocity.z *= 0.7;
      chunk.spin.multiplyScalar(0.6);
      if (Math.abs(chunk.velocity.y) < 0.35 && chunk.velocity.lengthSq() < 0.1)
        chunk.resting = true;
    }
  }

  private dispose(burst: Burst): void {
    burst.root.removeFromParent();
    for (const material of burst.materials) material.dispose();
  }

  clear(): void {
    for (const burst of this.bursts) this.dispose(burst);
    this.bursts.length = 0;
  }
}
