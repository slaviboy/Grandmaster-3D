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

// Fits the default camera to points measured by hand on the 587x440 reference screenshot, so the
// board appears at the same place, size and perspective. Prints src/scene/referenceView.ts.
// Run: node scripts/calibrate-camera.ts

import { PerspectiveCamera, Vector3 } from 'three';

const WIDTH = 587;
const HEIGHT = 440;

// World: 1 unit = 1 square, board centre at the origin, playing surface at y = 0, White at +z.
// Pixels: measured on the reference with a 5 px grid overlay.
const POINTS: ReadonlyArray<readonly [number, number, number, number]> = [
  // Rank boundaries along the d/e file line (x = 0).
  [0, -4, 270, 111.7],
  [0, -3, 270, 133.3],
  [0, -2, 270, 157.3],
  [0, -1, 270, 182.7],
  [0, 0, 270, 209.3],
  [0, 1, 270, 237.3],
  [0, 2, 270, 267.3],
  [0, 3, 270, 300.0],
  [0, 4, 270, 335.0],
  // Playing-area corners.
  [-4, -4, 140, 111.7],
  [4, -4, 401.7, 111.7],
  [-4, 4, 105, 335.0],
  [4, 4, 433.3, 335.0],
];

interface View {
  fov: number; // vertical, degrees
  elevation: number; // degrees above the board plane
  distance: number;
  targetZ: number;
  offsetX: number; // principal point shift in pixels of the reference frame
  offsetY: number;
}

function project(v: View, x: number, z: number): [number, number] {
  const camera = new PerspectiveCamera(v.fov, WIDTH / HEIGHT, 0.1, 100);
  const e = (v.elevation * Math.PI) / 180;
  camera.position.set(0, Math.sin(e) * v.distance, v.targetZ + Math.cos(e) * v.distance);
  camera.lookAt(0, 0, v.targetZ);
  camera.updateMatrixWorld();
  const p = new Vector3(x, 0, z).project(camera);
  return [((p.x + 1) / 2) * WIDTH + v.offsetX, ((1 - p.y) / 2) * HEIGHT + v.offsetY];
}

function error(v: View): number {
  let sum = 0;
  for (const [x, z, px, py] of POINTS) {
    const [qx, qy] = project(v, x, z);
    sum += (qx - px) ** 2 + (qy - py) ** 2;
  }
  return sum / POINTS.length;
}

const KEYS = ['fov', 'elevation', 'distance', 'targetZ', 'offsetX', 'offsetY'] as const;
const toView = (a: number[]): View =>
  Object.fromEntries(KEYS.map((k, i) => [k, a[i] ?? 0])) as unknown as View;

// Nelder-Mead over the six parameters.
function minimise(start: number[], steps: number[], iterations = 6000): number[] {
  const n = start.length;
  let simplex = [start, ...steps.map((s, i) => start.map((v, j) => (i === j ? v + s : v)))];
  const f = (p: number[]) => error(toView(p));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => f(a) - f(b));
    const best = simplex[0]!;
    const worst = simplex[n]!;
    const centroid = best.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p[j]!, 0) / n);
    const along = (t: number) => centroid.map((c, j) => c + t * (worst[j]! - c));
    const reflected = along(-1);
    if (f(reflected) < f(best)) {
      const expanded = along(-2);
      simplex[n] = f(expanded) < f(reflected) ? expanded : reflected;
    } else if (f(reflected) < f(simplex[n - 1]!)) {
      simplex[n] = reflected;
    } else {
      const contracted = along(0.5);
      if (f(contracted) < f(worst)) simplex[n] = contracted;
      else simplex = simplex.map((p) => best.map((b, j) => b + 0.5 * (p[j]! - b)));
    }
  }
  simplex.sort((a, b) => f(a) - f(b));
  return simplex[0]!;
}

const fit = toView(minimise([30, 50, 18, 0, -20, 0], [5, 5, 3, 0.5, 10, 10]));
const rms = Math.sqrt(error(fit));
const r = (n: number, d = 3) => Number(n.toFixed(d));
console.log(`// rms reprojection error: ${rms.toFixed(2)} px at ${WIDTH}x${HEIGHT}`);
console.log(
  JSON.stringify(
    {
      fov: r(fit.fov),
      elevation: r(fit.elevation),
      distance: r(fit.distance),
      targetZ: r(fit.targetZ),
      // Principal point as a fraction of the frame, so it holds at any window size.
      offsetX: r(fit.offsetX / WIDTH, 4),
      offsetY: r(fit.offsetY / HEIGHT, 4),
    },
    null,
    2,
  ),
);
for (const [x, z, px, py] of POINTS) {
  const [qx, qy] = project(fit, x, z);
  console.log(`(${x},${z}) measured ${px},${py} fitted ${qx.toFixed(1)},${qy.toFixed(1)}`);
}
