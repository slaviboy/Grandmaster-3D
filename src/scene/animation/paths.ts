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

// The routes pieces travel when they move. Pure geometry, no three.js, so it is easy to test.
//
// glide  - the default: a straight line from square to square in a low arc (higher for knights).
// follow - the piece takes its real route just above the board: the knight two squares, a rounded
//          turn, then one square (an L); rooks, bishops and queens along their line; the king and
//          pawns a short slide. Over any piece in the way the height rises smoothly to clear it.

import {
  squareIndices,
  squareToWorld,
  worldToSquare,
  type BoardPoint,
  type Square,
} from '../coords.ts';

export type PathMode = 'glide' | 'follow';

export interface PathSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MovePath {
  /** Length of the route along the board, in squares. */
  readonly length: number;
  /** Position at a fraction 0..1 of the route's length. */
  at(t: number): PathSample;
  /** Direction of travel on the board at a fraction of the route (unit x/z). */
  heading(t: number): BoardPoint;
}

export interface PathOptions {
  readonly mode: PathMode;
  readonly knight: boolean;
  /** Height of whatever stands on a square, or 0 for an empty square. */
  readonly heightAt?: (square: Square) => number;
}

/** Clearance kept above pieces that are flown over, in squares. */
export const CLEARANCE = 0.08;
/** Height of a sliding piece above the board. */
export const SLIDE_HEIGHT = 0.03;
const CORNER_RADIUS = 0.32;
const RAMP = 0.42;

export function buildPath(from: Square, to: Square, options: PathOptions): MovePath {
  const a = squareToWorld(from);
  const b = squareToWorld(to);
  if (options.mode === 'glide') return glidePath(a, b, options.knight ? 0.75 : 0.32);
  const outline = options.knight ? knightOutline(from, to) : [a, b];
  return followPath(outline, from, to, options.heightAt ?? (() => 0));
}

function glidePath(a: BoardPoint, b: BoardPoint, peak: number): MovePath {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  // Longer moves arc a little higher.
  const height = peak + Math.min(0.25, length * 0.04);
  const heading = length > 0 ? { x: dx / length, z: dz / length } : { x: 0, z: 1 };
  return {
    length,
    at: (t) => ({ x: a.x + dx * t, y: 4 * height * t * (1 - t), z: a.z + dz * t }),
    heading: () => heading,
  };
}

/** The knight's L: the two-square leg first, then the one-square leg. */
export function knightCorner(from: Square, to: Square): BoardPoint {
  const f = squareIndices(from);
  const t = squareIndices(to);
  const a = squareToWorld(from);
  const b = squareToWorld(to);
  return Math.abs(t.file - f.file) === 2 ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
}

function knightOutline(from: Square, to: Square): BoardPoint[] {
  const a = squareToWorld(from);
  const b = squareToWorld(to);
  const c = knightCorner(from, to);
  // Round the corner with a quadratic curve between points CORNER_RADIUS before and after it.
  const towards = (p: BoardPoint, q: BoardPoint, d: number): BoardPoint => {
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    return { x: p.x + ((q.x - p.x) / len) * d, z: p.z + ((q.z - p.z) / len) * d };
  };
  const enter = towards(c, a, CORNER_RADIUS);
  const leave = towards(c, b, CORNER_RADIUS);
  const points: BoardPoint[] = [a, enter];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    points.push({
      x: u * u * enter.x + 2 * u * t * c.x + t * t * leave.x,
      z: u * u * enter.z + 2 * u * t * c.z + t * t * leave.z,
    });
  }
  points.push(leave, b);
  return points;
}

function followPath(
  outline: BoardPoint[],
  from: Square,
  to: Square,
  heightAt: (square: Square) => number,
): MovePath {
  // Cumulative lengths along the polyline.
  const cumulative = [0];
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i - 1]!;
    const q = outline[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(q.x - p.x, q.z - p.z));
  }
  const length = cumulative.at(-1)!;

  const locate = (s: number): { point: BoardPoint; dir: BoardPoint } => {
    const target = Math.min(length, Math.max(0, s));
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i]! < target) i++;
    const p = outline[i - 1]!;
    const q = outline[i]!;
    const span = cumulative[i]! - cumulative[i - 1]! || 1;
    const k = (target - cumulative[i - 1]!) / span;
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return {
      point: { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k },
      dir: { x: (q.x - p.x) / len, z: (q.z - p.z) / len },
    };
  };

  // Where along the route each occupied square is crossed, and how high it must be cleared.
  const obstacles: Array<{ start: number; end: number; height: number }> = [];
  const step = 0.02;
  let current: { square: Square; start: number; height: number } | null = null;
  for (let s = 0; s <= length + 1e-9; s += step) {
    const { point } = locate(s);
    const square = worldToSquare(point.x, point.z);
    const blocking = square && square !== from && square !== to ? heightAt(square) : 0;
    if (current && current.square !== square) {
      obstacles.push({ start: current.start, end: s, height: current.height });
      current = null;
    }
    if (!current && blocking > 0 && square) current = { square, start: s, height: blocking };
  }
  if (current) obstacles.push({ start: current.start, end: length, height: current.height });

  const smooth = (u: number) => u * u * (3 - 2 * u);
  const heightAtDistance = (s: number): number => {
    // Lift off and settle down at the ends, slide in between.
    const ends = smooth(Math.min(1, s / 0.12)) * smooth(Math.min(1, (length - s) / 0.12));
    let h = SLIDE_HEIGHT * ends;
    for (const o of obstacles) {
      const top = o.height + CLEARANCE;
      const gap = s < o.start ? o.start - s : s > o.end ? s - o.end : 0;
      let w = smooth(Math.max(0, 1 - gap / RAMP));
      // Never rise before leaving the start square or after reaching the destination.
      w *= smooth(Math.min(1, s / 0.25)) * smooth(Math.min(1, (length - s) / 0.25));
      h = Math.max(h, top * w);
    }
    return h;
  };

  return {
    length,
    at: (t) => {
      const s = t * length;
      const { point } = locate(s);
      return { x: point.x, y: heightAtDistance(s), z: point.z };
    },
    heading: (t) => locate(t * length).dir,
  };
}
