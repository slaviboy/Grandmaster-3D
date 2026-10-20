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
// A Custom level takes any rating from 400 to 3000 and is interpolated between the same recipes,
// so a custom 1600 plays like Medium and a custom 800 halfway between Beginner and Easy.

import type { MovePolicy } from './movePolicy.ts';

export type PresetId = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'maximum';
export type DifficultyId = PresetId | 'custom';

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

export const DIFFICULTIES: readonly (DifficultyPreset & { readonly id: PresetId })[] = [
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
    options: { ...base, 'Skill Level': 1, MultiPV: 4 },
    go: { depth: 3, movetime: 250 },
    policy: { temperature: 160, blunderChance: 0.14, maxCpLoss: 450 },
    minThinkMs: 800,
  },
  {
    id: 'medium',
    label: 'Medium',
    rating: 1600,
    options: { ...base, UCI_LimitStrength: true, UCI_Elo: 1600 },
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

/** The range of the Custom level's rating slider. */
export const CUSTOM_RATING = { min: 400, max: 3000, step: 50, initial: 1500 } as const;

/** Stockfish's own strength limit starts here; weaker play needs the candidate-move policy. */
const ELO_FLOOR = 1320;

/** The preset for a level; `customRating` is only used by the Custom level. */
export function difficulty(
  id: DifficultyId,
  customRating: number = CUSTOM_RATING.initial,
): DifficultyPreset {
  if (id === 'custom') return customDifficulty(customRating);
  const preset = DIFFICULTIES.find((d) => d.id === id);
  if (!preset) throw new Error(`unknown difficulty ${id}`);
  return preset;
}

export function isDifficultyId(value: string): value is DifficultyId {
  return value === 'custom' || DIFFICULTIES.some((d) => d.id === value);
}

/** Keeps a rating inside the Custom range, on a whole number. */
export function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return CUSTOM_RATING.initial;
  return Math.round(Math.min(CUSTOM_RATING.max, Math.max(CUSTOM_RATING.min, rating)));
}

/** Piecewise-linear lookup in a table of [rating, value] points sorted by rating. */
function interpolate(points: ReadonlyArray<readonly [number, number]>, rating: number): number {
  const first = points[0]!;
  if (rating <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [r1, v1] = points[i]!;
    const [r0, v0] = points[i - 1]!;
    if (rating <= r1) return v0 + ((v1 - v0) * (rating - r0)) / (r1 - r0);
  }
  return points[points.length - 1]![1];
}

// Below the engine's limit the recipe is interpolated through the Beginner (600) and Easy (1000)
// settings, from a looser 400 up to a tighter 1320 where the engine's own limit takes over.
const WEAK = {
  skill: [
    [400, 0],
    [600, 0],
    [1000, 1],
    [1320, 3],
  ],
  depth: [
    [400, 1],
    [600, 2],
    [1000, 3],
    [1320, 5],
  ],
  movetime: [
    [400, 120],
    [600, 150],
    [1000, 250],
    [1320, 400],
  ],
  multiPv: [
    [400, 5],
    [600, 5],
    [1000, 4],
    [1320, 3],
  ],
  temperature: [
    [400, 300],
    [600, 220],
    [1000, 160],
    [1320, 70],
  ],
  blunderChance: [
    [400, 0.32],
    [600, 0.22],
    [1000, 0.14],
    [1320, 0.05],
  ],
  maxCpLoss: [
    [400, 900],
    [600, 700],
    [1000, 450],
    [1320, 250],
  ],
  minThinkMs: [
    [400, 1000],
    [600, 900],
    [1000, 800],
    [1320, 700],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>;

// From the engine's limit up, the think time and pause follow Medium, Hard and Expert.
const STRONG = {
  movetime: [
    [ELO_FLOOR, 500],
    [1600, 600],
    [1900, 1000],
    [2400, 1500],
    [3000, 2500],
  ],
  minThinkMs: [
    [ELO_FLOOR, 650],
    [1600, 600],
    [1900, 400],
    [2400, 300],
    [3000, 0],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>;

/** A level built for any rating in the Custom range. */
export function customDifficulty(rating: number): DifficultyPreset {
  const r = clampRating(rating);
  const named = { id: 'custom' as const, label: 'Custom', rating: r };
  if (r >= CUSTOM_RATING.max) return { ...difficulty('maximum'), ...named };
  if (r >= ELO_FLOOR) {
    return {
      ...named,
      options: { ...base, UCI_LimitStrength: true, UCI_Elo: r },
      go: { movetime: Math.round(interpolate(STRONG.movetime, r)) },
      policy: null,
      minThinkMs: Math.round(interpolate(STRONG.minThinkMs, r)),
    };
  }
  const at = (table: ReadonlyArray<readonly [number, number]>) => interpolate(table, r);
  return {
    ...named,
    options: {
      ...base,
      'Skill Level': Math.round(at(WEAK.skill)),
      MultiPV: Math.round(at(WEAK.multiPv)),
    },
    go: { depth: Math.round(at(WEAK.depth)), movetime: Math.round(at(WEAK.movetime)) },
    policy: {
      temperature: at(WEAK.temperature),
      blunderChance: at(WEAK.blunderChance),
      maxCpLoss: at(WEAK.maxCpLoss),
    },
    minThinkMs: Math.round(at(WEAK.minThinkMs)),
  };
}
