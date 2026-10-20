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

// Player preferences, saved in the browser when it allows it. A missing or unreadable store just
// means the defaults; nothing depends on storage working.

import { isDifficultyId, type DifficultyId } from '../engine/difficulty.ts';
import type { Color } from './types.ts';

export type GameMode = 'computer' | 'local';

export interface Settings {
  readonly difficulty: DifficultyId;
  readonly humanColor: Color;
  readonly mode: GameMode;
  /** Minutes per player; 0 means untimed. */
  readonly minutes: number;
  readonly sound: boolean;
  /** 0 = instant, 1 = normal, 2 = slow. */
  readonly animationSpeed: number;
  /** Pieces travel their real path (the knight in an L) instead of gliding straight. */
  readonly followPath: boolean;
  /** Captured pieces shatter into wooden fragments instead of simply disappearing. */
  readonly demolish: boolean;
  readonly showLegalMoves: boolean;
  readonly showCoordinates: boolean;
  readonly showLastMove: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'easy',
  humanColor: 'w',
  mode: 'computer',
  minutes: 10,
  sound: true,
  animationSpeed: 1,
  followPath: false,
  demolish: false,
  showLegalMoves: true,
  showCoordinates: true,
  showLastMove: true,
};

export const TIME_CONTROLS: readonly number[] = [0, 5, 10, 15, 30];

const KEY = 'grandmaster-3d.settings.v1';

/** Merges stored values over the defaults, keeping only values of the right kind. */
export function sanitize(raw: unknown): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
      if (fallback === undefined || typeof value !== typeof fallback) continue;
      out[key] = value;
    }
  }
  const s = out as unknown as Settings;
  return {
    ...s,
    difficulty: isDifficultyId(s.difficulty) ? s.difficulty : DEFAULT_SETTINGS.difficulty,
    humanColor: s.humanColor === 'b' ? 'b' : 'w',
    mode: s.mode === 'local' ? 'local' : 'computer',
    minutes: TIME_CONTROLS.includes(s.minutes) ? s.minutes : DEFAULT_SETTINGS.minutes,
    animationSpeed: Math.min(2, Math.max(0, s.animationSpeed)),
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  try {
    const text = storage?.getItem(KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private windows and blocked storage: the settings simply last for this visit.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
