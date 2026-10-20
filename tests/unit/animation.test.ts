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

import { describe, expect, it } from 'vitest';
import { CLEARANCE, buildPath, knightCorner } from '../../src/scene/animation/paths.ts';
import { Tweener, easeTrapezoid } from '../../src/scene/animation/tween.ts';
import { squareToWorld, type Square } from '../../src/scene/coords.ts';

describe('Tweener', () => {
  it('reports progress and resolves at the end of its duration', async () => {
    const tweener = new Tweener();
    const seen: number[] = [];
    let done = false;
    const run = tweener
      .run(
        1,
        (p) => seen.push(p),
        (t) => t,
      )
      .then(() => (done = true));
    tweener.update(0.5);
    expect(seen.at(-1)).toBeCloseTo(0.5);
    expect(tweener.update(0.6)).toBe(false);
    await run;
    expect(done).toBe(true);
    expect(seen.at(-1)).toBe(1);
  });

  it('jumps to the end at speed 0 and on finishAll', async () => {
    const tweener = new Tweener();
    tweener.speed = 0;
    let last = -1;
    await tweener.run(2, (p) => (last = p));
    expect(last).toBe(1);
    tweener.speed = 1;
    const pending = tweener.run(5, (p) => (last = p));
    tweener.finishAll();
    await pending;
    expect(last).toBe(1);
    expect(tweener.running).toBe(false);
  });

  it('eases a trapezoid from 0 to 1 monotonically', () => {
    const ease = easeTrapezoid(0.2);
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const v = ease(i / 100);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 5);
  });
});

const near = (a: { x: number; z: number }, square: Square) => {
  const b = squareToWorld(square);
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

describe('move paths', () => {
  it('glides straight from square centre to square centre in an arc', () => {
    const path = buildPath('e2', 'e4', { mode: 'glide', knight: false });
    near(path.at(0), 'e2');
    near(path.at(1), 'e4');
    expect(path.at(0).y).toBe(0);
    expect(path.at(1).y).toBeCloseTo(0, 10);
    expect(path.at(0.5).y).toBeGreaterThan(0.25);
    expect(path.at(0.5).x).toBeCloseTo(squareToWorld('e3').x);
  });

  it('takes the knight two squares, then one: g1-f3 turns at g3', () => {
    expect(knightCorner('g1', 'f3')).toEqual(squareToWorld('g3'));
    expect(knightCorner('b1', 'd2')).toEqual(squareToWorld('d1'));
    const path = buildPath('g1', 'f3', { mode: 'follow', knight: true });
    near(path.at(0), 'g1');
    near(path.at(1), 'f3');
    // The first part runs straight up the g-file, the last part along rank 3.
    expect(path.at(0.3).x).toBeCloseTo(squareToWorld('g1').x, 6);
    expect(path.at(0.97).z).toBeCloseTo(squareToWorld('f3').z, 6);
    expect(path.heading(0.1)).toEqual({ x: 0, z: -1 });
    expect(path.heading(0.97).x).toBeCloseTo(-1);
    expect(path.length).toBeGreaterThan(2.5);
    expect(path.length).toBeLessThan(3);
  });

  it('slides low on an empty route and lifts over pieces in the way', () => {
    const empty = buildPath('g1', 'f3', { mode: 'follow', knight: true, heightAt: () => 0 });
    for (let i = 0; i <= 20; i++) expect(empty.at(i / 20).y).toBeLessThan(0.05);

    const pawnHeight = 0.83;
    const blocked = buildPath('g1', 'f3', {
      mode: 'follow',
      knight: true,
      heightAt: (s) => (s === 'g2' ? pawnHeight : 0),
    });
    // Over g2 the knight clears the pawn.
    const overG2 = blocked.at(1 / blocked.length);
    expect(overG2.y).toBeGreaterThanOrEqual(pawnHeight + CLEARANCE - 1e-9);
    // It still lands on f3 at board level.
    expect(blocked.at(1).y).toBeCloseTo(0, 6);
  });

  it('does not count the start and destination squares as obstacles', () => {
    const path = buildPath('a1', 'a4', { mode: 'follow', knight: false, heightAt: () => 1 });
    expect(path.at(0).y).toBeCloseTo(0, 6);
    expect(path.at(1).y).toBeCloseTo(0, 6);
    // a2 and a3 are "occupied" by the stub, so the rook rises between them.
    expect(path.at(0.5).y).toBeGreaterThan(1);
  });

  it('runs bishops and queens along their line', () => {
    const path = buildPath('c1', 'h6', { mode: 'follow', knight: false });
    const mid = path.at(0.4);
    expect(mid.x - squareToWorld('c1').x).toBeCloseTo(-(mid.z - squareToWorld('c1').z), 6);
    expect(path.length).toBeCloseTo(Math.SQRT2 * 5, 6);
  });
});
