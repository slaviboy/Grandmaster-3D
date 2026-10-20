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

// The six difficulty levels in one table. Every level sets all engine options, because UCI
// options persist between searches. Stockfish's own strength limit (UCI_Elo) bottoms out at 1320,
// so the two easiest levels combine the lowest Skill Level with a shallow search and an app-side
// policy that sometimes picks a weaker candidate move. Expected strengths are approximate; the
// strength ladder (scripts/strength-ladder.ts) checks that each level beats the one below it.

import type { MovePolicy } from './movePolicy.ts';

export type DifficultyId = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'maximum';

export type UciOptions = Readonly<Record<string, string | number | boolean>>;

export interface GoLimits {
  readonly movetime?: number;
  readonly depth?: number;
}

export interface DifficultyPreset {
  readonly id: DifficultyId;
  readonly label: string;
  /** Rough playing strength shown next to the computer's name. */
  readonly rating: number;
  readonly options: UciOptions;
  readonly go: GoLimits;
  /** When set, the move is picked from several candidates instead of always the best. */
  readonly policy: MovePolicy | null;
  /** The computer waits at least this long before moving, so easy levels do not snap back. */
  readonly minThinkMs: number;
}

const base = { Hash: 16, UCI_LimitStrength: false, UCI_Elo: 1320, 'Skill Level': 20, MultiPV: 1 };

export const DIFFICULTIES: readonly DifficultyPreset[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    rating: 600,
    options: { ...base, 'Skill Level': 0, MultiPV: 5 },
    go: { depth: 2, movetime: 150 },
    policy: { temperature: 220, blunderChance: 0.22, maxCpLoss: 700 },
    minThinkMs: 900,
  },
  {
    id: 'easy',
    label: 'Easy',
    rating: 1000,
    options: { ...base, 'Skill Level': 3, MultiPV: 4 },
    go: { depth: 5, movetime: 300 },
    policy: { temperature: 90, blunderChance: 0.06, maxCpLoss: 300 },
    minThinkMs: 800,
  },
  {
    id: 'medium',
    label: 'Medium',
    rating: 1500,
    options: { ...base, UCI_LimitStrength: true, UCI_Elo: 1500 },
    go: { movetime: 600 },
    policy: null,
    minThinkMs: 600,
  },
  {
    id: 'hard',
    label: 'Hard',
    rating: 1900,
    options: { ...base, UCI_LimitStrength: true, UCI_Elo: 1900 },
    go: { movetime: 1000 },
    policy: null,
    minThinkMs: 400,
  },
  {
    id: 'expert',
    label: 'Expert',
    rating: 2400,
    options: { ...base, UCI_LimitStrength: true, UCI_Elo: 2400 },
    go: { movetime: 1500 },
    policy: null,
    minThinkMs: 300,
  },
  {
    id: 'maximum',
    label: 'Maximum Strength',
    rating: 3000,
    options: { ...base, Hash: 64 },
    go: { movetime: 2500 },
    policy: null,
    minThinkMs: 0,
  },
];

export function difficulty(id: DifficultyId): DifficultyPreset {
  const preset = DIFFICULTIES.find((d) => d.id === id);
  if (!preset) throw new Error(`unknown difficulty ${id}`);
  return preset;
}

export function isDifficultyId(value: string): value is DifficultyId {
  return DIFFICULTIES.some((d) => d.id === value);
}
