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

// Pure parsers for the lines a UCI engine prints.

export interface PvLine {
  readonly multipv: number;
  readonly depth: number;
  /** Centipawns from the side to move's point of view. */
  readonly cp?: number;
  /** Moves to mate; negative when the side to move is being mated. */
  readonly mate?: number;
  readonly pv: readonly string[];
  readonly bound?: 'lower' | 'upper';
}

export interface Bestmove {
  /** null when the engine has no move (checkmate or stalemate on the board). */
  readonly move: string | null;
  readonly ponder?: string;
}

export interface UciOption {
  readonly name: string;
  readonly type: string;
  readonly default?: string;
  readonly min?: number;
  readonly max?: number;
}

/** Parses an "info ... pv ..." line; returns null for lines without a principal variation. */
export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith('info ') || line.startsWith('info string')) return null;
  const tokens = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let cp: number | undefined;
  let mate: number | undefined;
  let bound: 'lower' | 'upper' | undefined;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'depth') depth = Number(tokens[++i]);
    else if (token === 'multipv') multipv = Number(tokens[++i]);
    else if (token === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      if (kind === 'cp') cp = value;
      else if (kind === 'mate') mate = value;
      const next = tokens[i + 1];
      if (next === 'lowerbound' || next === 'upperbound') {
        bound = next === 'lowerbound' ? 'lower' : 'upper';
        i++;
      }
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1).filter(Boolean);
      break;
    }
  }
  if (pv.length === 0 || (cp === undefined && mate === undefined)) return null;
  return { multipv, depth, cp, mate, pv, ...(bound ? { bound } : {}) };
}

export function parseBestmove(line: string): Bestmove | null {
  const match = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line.trim());
  if (!match) return null;
  const move = match[1] === '(none)' || match[1] === '0000' ? null : match[1]!;
  return match[2] ? { move, ponder: match[2] } : { move };
}

export function parseOption(line: string): UciOption | null {
  const match = /^option name (.+?) type (\S+)(.*)$/.exec(line.trim());
  if (!match) return null;
  const rest = match[3] ?? '';
  const pick = (key: string) => new RegExp(`\\b${key} (\\S+)`).exec(rest)?.[1];
  const min = pick('min');
  const max = pick('max');
  const fallback = /\bdefault ?(.*?)(?: min | max | var |$)/.exec(rest)?.[1];
  return {
    name: match[1]!,
    type: match[2]!,
    ...(fallback !== undefined ? { default: fallback.trim() } : {}),
    ...(min !== undefined ? { min: Number(min) } : {}),
    ...(max !== undefined ? { max: Number(max) } : {}),
  };
}

/** A comparable score for a line: mates rank above every centipawn value. */
export function lineScore(line: PvLine): number {
  if (line.mate !== undefined) {
    return line.mate > 0 ? 100000 - 100 * line.mate : -100000 - 100 * line.mate;
  }
  return line.cp ?? 0;
}
