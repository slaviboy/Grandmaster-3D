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

// Checks the GLB files the game ships: valid glTF 2.0 binaries, one mesh per piece standing on
// y = 0 at the measured height, within budget, and the same shape for both sides.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'] as const;
const metadata = JSON.parse(readFileSync(join(root, 'blender', 'metadata.json'), 'utf8')) as Record<
  string,
  { height: number; triangles: number }
>;

interface Gltf {
  asset: { version: string };
  nodes: Array<{ mesh?: number; children?: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices?: number }> }>;
  accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
}

function readGlb(path: string): Gltf {
  const data = readFileSync(path);
  expect(data.toString('ascii', 0, 4)).toBe('glTF');
  expect(data.readUInt32LE(4)).toBe(2);
  expect(data.readUInt32LE(8)).toBe(data.length);
  const jsonLength = data.readUInt32LE(12);
  expect(data.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(data.toString('utf8', 20, 20 + jsonLength)) as Gltf;
}

describe('piece models', () => {
  for (const kind of TYPES) {
    it(`${kind}: one mesh at the measured height, identical for both sides`, () => {
      const white = readGlb(join(root, 'public/models/chess', `white-${kind}.glb`));
      const black = readGlb(join(root, 'public/models/chess', `black-${kind}.glb`));
      expect(white.asset.version).toBe('2.0');
      expect(white.meshes).toHaveLength(1);
      const primitive = white.meshes[0]!.primitives[0]!;
      const position = white.accessors[primitive.attributes.POSITION]!;
      expect(position.min![1]).toBeCloseTo(0, 4);
      expect(position.max![1]).toBeCloseTo(metadata[kind]!.height, 3);
      // Centred on its axis.
      expect(Math.abs(position.min![0]! + position.max![0]!)).toBeLessThan(0.12);
      const triangles = white.accessors[primitive.indices!]!.count / 3;
      expect(triangles).toBeLessThanOrEqual(15000);
      const blackPosition = black.accessors[black.meshes[0]!.primitives[0]!.attributes.POSITION]!;
      expect(blackPosition.count).toBe(position.count);
    });

    it(`${kind}: fragments for the Demolish animation`, () => {
      const fragments = readGlb(join(root, 'public/models/chess/fragments', `${kind}.glb`));
      expect(fragments.meshes.length).toBeGreaterThanOrEqual(10);
    });
  }

  it('keeps the classic height order: king, queen, bishop, knight, rook, pawn', () => {
    const heights = TYPES.map((t) => metadata[t]!.height);
    const [pawn, rook, knight, bishop, queen, king] = heights as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    expect(king).toBeGreaterThan(queen);
    expect(queen).toBeGreaterThan(bishop);
    expect(bishop).toBeGreaterThan(knight);
    expect(knight).toBeGreaterThan(rook);
    expect(rook).toBeGreaterThan(pawn);
  });
});
