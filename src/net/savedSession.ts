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

// The online game a tab is playing, kept in sessionStorage (this tab only, gone when it closes) so
// a reload can rejoin. What comes back is checked like anything else from outside: a malformed
// entry counts as no entry.

import type { SavedSession, SessionStorage } from './OnlineSession.ts';
import { MAX_PLIES, cleanName, isInvite, isToken } from './protocol.ts';

const KEY = 'grandmaster-3d:online';
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MINUTES = [0, 5, 10, 15, 30];

const isTime = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** The saved session if the value is exactly one; null for anything else. */
export function parseSaved(value: unknown): SavedSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (!isInvite(s.invite)) return null;
  if (s.role !== 'host' && s.role !== 'guest') return null;
  if (!isToken(s.token)) return null;
  if (s.color !== 'w' && s.color !== 'b' && s.color !== null) return null;
  if (!MINUTES.includes(s.minutes as number)) return null;
  if (typeof s.name !== 'string' || typeof s.friendName !== 'string') return null;
  const moves = s.moves;
  if (!Array.isArray(moves) || moves.length > MAX_PLIES) return null;
  if (!moves.every((m) => typeof m === 'string' && UCI.test(m))) return null;
  const clocks = s.clocks as Record<string, unknown> | null;
  if (typeof clocks !== 'object' || clocks === null || !isTime(clocks.w) || !isTime(clocks.b))
    return null;
  return {
    invite: { secret: s.invite.secret },
    role: s.role,
    token: s.token,
    name: cleanName(s.name, 'Player'),
    friendName: cleanName(s.friendName),
    color: s.color,
    minutes: s.minutes as number,
    moves: [...(moves as string[])],
    clocks: { w: clocks.w as number, b: clocks.b as number },
  };
}

/** sessionStorage, quietly doing nothing where storage is blocked. */
export const tabStorage: SessionStorage & { load(): SavedSession | null } = {
  load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? parseSaved(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save(session) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      // Private browsing or full storage: a reload simply cannot rejoin.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // As above.
    }
  },
};
