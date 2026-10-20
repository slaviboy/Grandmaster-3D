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

// Picks a move from the engine's candidate lines for the easy levels: usually a good one, sometimes
// a merely plausible one, occasionally a real mistake. It only ever returns a legal move.

import type { Rng } from '../core/rng.ts';
import { lineScore, type PvLine } from './uci.ts';

export interface MovePolicy {
  /** Centipawns: how quickly worse moves become unlikely. Higher plays looser. */
  readonly temperature: number;
  /** Chance of allowing a move that loses more than maxCpLoss. */
  readonly blunderChance: number;
  /** Moves losing more than this are normally excluded. */
  readonly maxCpLoss: number;
}

export function pickMove(
  lines: readonly PvLine[],
  policy: MovePolicy,
  rng: Rng,
  legal: ReadonlySet<string>,
): string | null {
  // Keep the deepest exact line per candidate move.
  const byMove = new Map<string, PvLine>();
  for (const line of lines) {
    const move = line.pv[0];
    if (!move || !legal.has(move) || line.bound) continue;
    const seen = byMove.get(move);
    if (!seen || line.depth >= seen.depth) byMove.set(move, line);
  }
  const candidates = [...byMove.entries()].map(([move, line]) => ({
    move,
    score: lineScore(line),
  }));
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((c) => c.score));
  const allowBlunder = rng() < policy.blunderChance;
  const pool = candidates.filter((c) => allowBlunder || best - c.score <= policy.maxCpLoss);
  const weights = pool.map((c) => Math.exp(-Math.min(best - c.score, 5000) / policy.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i]!;
    if (pick <= 0) return pool[i]!.move;
  }
  return pool.at(-1)!.move;
}
