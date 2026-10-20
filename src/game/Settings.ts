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

import {
  CUSTOM_RATING,
  clampRating,
  isDifficultyId,
  type DifficultyId,
} from '../engine/difficulty.ts';
import {
  DEFAULT_BOARD,
  DEFAULT_CUSTOM,
  DEFAULT_PIECES,
  DEFAULT_TABLE,
  isBoardThemeId,
  isHexColour,
  isPieceThemeId,
  isTableThemeId,
  type CustomColours,
} from '../scene/themes.ts';
import type { Color } from './types.ts';

export type GameMode = 'computer' | 'local';

/** The interface around the board: the modern design, or the retro one of the reference. */
export type UiStyle = 'modern' | 'retro';

export function isUiStyle(value: unknown): value is UiStyle {
  return value === 'modern' || value === 'retro';
}

export interface Settings {
  readonly difficulty: DifficultyId;
  /** The computer's rating when the difficulty is Custom. */
  readonly customRating: number;
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
  /** Glass that mirrors and refracts for real; off swaps in cheaper look-alikes. */
  readonly glassReflections: boolean;
  readonly showLegalMoves: boolean;
  readonly showCoordinates: boolean;
  readonly showLastMove: boolean;
  /** Board, piece set and table looks (preset ids or "custom"). */
  readonly boardTheme: string;
  readonly pieceTheme: string;
  readonly tableTheme: string;
  /** The player's colours for the Custom looks. */
  readonly custom: CustomColours;
  readonly uiStyle: UiStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'easy',
  customRating: CUSTOM_RATING.initial,
  humanColor: 'w',
  mode: 'computer',
  minutes: 10,
  sound: true,
  animationSpeed: 1,
  followPath: false,
  demolish: false,
  glassReflections: true,
  showLegalMoves: true,
  showCoordinates: true,
  showLastMove: true,
  boardTheme: DEFAULT_BOARD,
  pieceTheme: DEFAULT_PIECES,
  tableTheme: DEFAULT_TABLE,
  custom: DEFAULT_CUSTOM,
  uiStyle: 'retro',
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
    customRating: clampRating(s.customRating),
    humanColor: s.humanColor === 'b' ? 'b' : 'w',
    mode: s.mode === 'local' ? 'local' : 'computer',
    minutes: TIME_CONTROLS.includes(s.minutes) ? s.minutes : DEFAULT_SETTINGS.minutes,
    animationSpeed: Math.min(2, Math.max(0, s.animationSpeed)),
    boardTheme: isBoardThemeId(s.boardTheme) ? s.boardTheme : DEFAULT_BOARD,
    pieceTheme: isPieceThemeId(s.pieceTheme) ? s.pieceTheme : DEFAULT_PIECES,
    tableTheme: isTableThemeId(s.tableTheme) ? s.tableTheme : DEFAULT_TABLE,
    custom: sanitizeCustom(s.custom),
    uiStyle: isUiStyle(s.uiStyle) ? s.uiStyle : DEFAULT_SETTINGS.uiStyle,
  };
}

function sanitizeCustom(raw: unknown): CustomColours {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const colour = (key: keyof CustomColours) =>
    isHexColour(value[key]) ? (value[key] as string) : (DEFAULT_CUSTOM[key] as string);
  const boardPattern = ['wood', 'marble', 'plain'].includes(value.boardPattern as string)
    ? (value.boardPattern as CustomColours['boardPattern'])
    : DEFAULT_CUSTOM.boardPattern;
  const finish = ['wood', 'lacquer', 'metal', 'stone', 'glass', 'gloss'].includes(
    value.finish as string,
  )
    ? (value.finish as CustomColours['finish'])
    : DEFAULT_CUSTOM.finish;
  return {
    light: colour('light'),
    dark: colour('dark'),
    frame: colour('frame'),
    boardPattern,
    white: colour('white'),
    black: colour('black'),
    finish,
    table: colour('table'),
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
