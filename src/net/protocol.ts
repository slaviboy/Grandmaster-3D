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

// What two players' browsers say to each other in an online game, and the invitation link that
// brings them together. Everything that arrives from the other player is untrusted: parseMessage
// accepts only the exact shapes below and drops anything else, so a modified client can never push
// an unexpected field or type into the game.

import type { Color } from '../game/types.ts';

export const PROTOCOL_VERSION = 1;
/** No message is longer; anything bigger is dropped before it is read. */
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_NAME_LENGTH = 24;
/** The longest game a sync can carry, in half-moves (well beyond any real game). */
export const MAX_PLIES = 600;
/** Clock values beyond three hours are nonsense for the time controls on offer. */
const MAX_CLOCK_MS = 3 * 60 * 60 * 1000;
const TIME_CONTROLS = [0, 5, 10, 15, 30];

export type Message =
  /** Sent by both sides when the connection opens; the guest adds its token when it rejoins. */
  | { readonly t: 'hello'; readonly v: number; readonly name: string; readonly token?: string }
  /** The host's terms: its colour, the time control and the guest's token for rejoining. */
  | {
      readonly t: 'setup';
      readonly hostColor: Color;
      readonly minutes: number;
      readonly token: string;
    }
  /** A move by the sender; ply is its index in the game (0 for White's first move). */
  | { readonly t: 'move'; readonly uci: string; readonly ply: number }
  /** The sender resigns. */
  | { readonly t: 'resign' }
  /** The sender's own flag fell. */
  | { readonly t: 'flag' }
  /** The sender offers a draw, or accepts the offer it was sent. */
  | { readonly t: 'draw' }
  /** The sender wants a rematch, or accepts the one it was offered. */
  | { readonly t: 'rematch' }
  /** The host's game so far, sent when the guest comes back; clocks only count for an empty board. */
  | {
      readonly t: 'sync';
      readonly moves: readonly string[];
      readonly clocks: { readonly w: number; readonly b: number };
    }
  /** Whether the sender's microphone and camera are on. */
  | { readonly t: 'media'; readonly mic: boolean; readonly cam: boolean }
  /** The sender is leaving the game. */
  | { readonly t: 'bye' };

export type MessageType = Message['t'];

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True when the object has exactly these keys: no more, no fewer (optional ones may be absent). */
function hasKeys(value: Raw, required: readonly string[], optional: readonly string[] = []) {
  const keys = Object.keys(value);
  return (
    required.every((k) => Object.hasOwn(value, k)) &&
    keys.every((k) => required.includes(k) || optional.includes(k))
  );
}

const isColor = (value: unknown): value is Color => value === 'w' || value === 'b';
const isPly = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_PLIES;
const isClock = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_CLOCK_MS;

/**
 * A display name made safe: control and formatting characters (including the ones that reverse
 * text) are removed, spaces are collapsed, and it is cut to the maximum length.
 */
export function cleanName(value: string, fallback = 'Friend'): string {
  const cleaned = value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, MAX_NAME_LENGTH).join('').trim() || fallback;
}

/** The message, if the data is exactly one of the shapes above; null for anything else. */
export function parseMessage(data: unknown): Message | null {
  if (!isObject(data) || typeof data.t !== 'string') return null;
  switch (data.t) {
    case 'hello':
      if (!hasKeys(data, ['t', 'v', 'name'], ['token'])) return null;
      if (data.v !== PROTOCOL_VERSION || typeof data.name !== 'string') return null;
      if (data.name.length > MAX_NAME_LENGTH * 4) return null;
      if (data.token !== undefined && (typeof data.token !== 'string' || !TOKEN.test(data.token)))
        return null;
      return {
        t: 'hello',
        v: data.v,
        name: cleanName(data.name),
        ...(data.token !== undefined ? { token: data.token as string } : {}),
      };
    case 'setup':
      if (!hasKeys(data, ['t', 'hostColor', 'minutes', 'token'])) return null;
      if (!isColor(data.hostColor) || !TIME_CONTROLS.includes(data.minutes as number)) return null;
      if (typeof data.token !== 'string' || !TOKEN.test(data.token)) return null;
      return {
        t: 'setup',
        hostColor: data.hostColor,
        minutes: data.minutes as number,
        token: data.token,
      };
    case 'move':
      if (!hasKeys(data, ['t', 'uci', 'ply'])) return null;
      if (typeof data.uci !== 'string' || !UCI.test(data.uci) || !isPly(data.ply)) return null;
      return { t: 'move', uci: data.uci, ply: data.ply };
    case 'resign':
    case 'flag':
    case 'draw':
    case 'rematch':
    case 'bye':
      return hasKeys(data, ['t']) ? { t: data.t } : null;
    case 'sync': {
      if (!hasKeys(data, ['t', 'moves', 'clocks'])) return null;
      const { moves, clocks } = data;
      if (!Array.isArray(moves) || moves.length > MAX_PLIES) return null;
      if (!moves.every((m) => typeof m === 'string' && UCI.test(m))) return null;
      if (!isObject(clocks) || !hasKeys(clocks, ['w', 'b'])) return null;
      if (!isClock(clocks.w) || !isClock(clocks.b)) return null;
      return { t: 'sync', moves: [...(moves as string[])], clocks: { w: clocks.w, b: clocks.b } };
    }
    case 'media':
      if (!hasKeys(data, ['t', 'mic', 'cam'])) return null;
      if (typeof data.mic !== 'boolean' || typeof data.cam !== 'boolean') return null;
      return { t: 'media', mic: data.mic, cam: data.cam };
    default:
      return null;
  }
}

// --- the invitation link ---------------------------------------------------------------------

/**
 * An invitation: one random secret, which lives only in the link's hash (browsers never send the
 * hash to the web server). It encrypts the handshake and proves a player was invited, and the
 * room the two meet in is derived from it, so the link carries nothing else and stays short.
 */
export interface Invite {
  readonly secret: string;
}

const SECRET = /^[A-Za-z0-9_-]{22}$/;
const INVITE_HASH = /^#g=([A-Za-z0-9_-]{22})$/;

/** Random bytes as unpadded base64url. */
export function randomId(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A fresh invitation: 128 random bits, far beyond guessing, in 22 characters, so the link and
 * its QR code stay small.
 */
export function createInvite(): Invite {
  return { secret: randomId(16) };
}

/**
 * The room the two players meet in on the relays, derived one way from the secret: the same for
 * both, different for every game, and telling nothing about the secret.
 */
export async function roomFor(invite: Invite): Promise<string> {
  const data = new TextEncoder().encode(`grandmaster-3d room:${invite.secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return base64url(digest.subarray(0, 16));
}

/** A token the host gives its guest, so only that guest can take the seat back after a reload. */
export function createToken(): string {
  return randomId(16);
}

export function isInvite(value: unknown): value is Invite {
  return isObject(value) && typeof value.secret === 'string' && SECRET.test(value.secret);
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

/**
 * The link to send: the page's address without its query or hash (the friend keeps their own
 * settings), and the invitation in the hash.
 */
export function inviteUrl(page: string, invite: Invite): string {
  const url = new URL(page);
  return `${url.origin}${url.pathname}#g=${invite.secret}`;
}

/** The invitation in a location hash, if it is exactly one; null for anything else. */
export function parseInvite(hash: string): Invite | null {
  const match = INVITE_HASH.exec(hash);
  return match ? { secret: match[1]! } : null;
}
