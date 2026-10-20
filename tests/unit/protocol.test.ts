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

import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  MAX_PLIES,
  PROTOCOL_VERSION,
  cleanName,
  createInvite,
  createToken,
  inviteUrl,
  isInvite,
  parseInvite,
  parseMessage,
  roomFor,
} from '../../src/net/protocol.ts';
import { parseSaved } from '../../src/net/savedSession.ts';

const SAMPLE_ID = 'abcdefghijklmnopqrstuv';

describe('parseMessage', () => {
  it('accepts every message in its exact shape', () => {
    const valid = [
      { t: 'hello', v: PROTOCOL_VERSION, name: 'Ana' },
      { t: 'hello', v: PROTOCOL_VERSION, name: 'Ana', token: SAMPLE_ID },
      { t: 'setup', hostColor: 'b', minutes: 10, token: SAMPLE_ID },
      { t: 'move', uci: 'e2e4', ply: 0 },
      { t: 'move', uci: 'e7e8q', ply: 41 },
      { t: 'resign' },
      { t: 'flag' },
      { t: 'draw' },
      { t: 'rematch' },
      { t: 'sync', moves: ['e2e4', 'e7e5'], clocks: { w: 1000, b: 0 } },
      { t: 'media', mic: true, cam: false },
      { t: 'bye' },
    ];
    for (const message of valid) expect(parseMessage(message)).toEqual(message);
  });

  it('drops anything that is not an object with a known type', () => {
    for (const data of [null, 3, 'move', [], ['move'], {}, { t: 'castle' }, { t: 7 }]) {
      expect(parseMessage(data)).toBeNull();
    }
  });

  it('drops extra, missing and wrongly typed fields', () => {
    const bad = [
      { t: 'resign', winner: 'w' },
      { t: 'move', uci: 'e2e4' },
      { t: 'move', uci: 'e2e4', ply: 0, clock: 1 },
      { t: 'move', uci: 'e2e9', ply: 0 },
      { t: 'move', uci: 'e2e4k', ply: 0 },
      { t: 'move', uci: 'E2E4', ply: 0 },
      { t: 'move', uci: 'e2e4', ply: -1 },
      { t: 'move', uci: 'e2e4', ply: 1.5 },
      { t: 'move', uci: 'e2e4', ply: MAX_PLIES },
      { t: 'move', uci: 'e2e4', ply: '0' },
      { t: 'hello', v: PROTOCOL_VERSION + 1, name: 'Ana' },
      { t: 'hello', v: PROTOCOL_VERSION, name: 7 },
      { t: 'hello', v: PROTOCOL_VERSION, name: 'x'.repeat(500) },
      { t: 'hello', v: PROTOCOL_VERSION, name: 'Ana', token: 'short' },
      { t: 'setup', hostColor: 'red', minutes: 10, token: SAMPLE_ID },
      { t: 'setup', hostColor: 'w', minutes: 7, token: SAMPLE_ID },
      { t: 'setup', hostColor: 'w', minutes: 10 },
      { t: 'sync', moves: 'e2e4', clocks: { w: 0, b: 0 } },
      { t: 'sync', moves: ['e2e4', 'castle'], clocks: { w: 0, b: 0 } },
      { t: 'sync', moves: [], clocks: { w: -1, b: 0 } },
      { t: 'sync', moves: [], clocks: { w: Infinity, b: 0 } },
      { t: 'sync', moves: [], clocks: { w: 0 } },
      { t: 'sync', moves: Array(MAX_PLIES + 1).fill('e2e4'), clocks: { w: 0, b: 0 } },
      { t: 'media', mic: 'yes', cam: false },
    ];
    for (const data of bad) expect(parseMessage(data), JSON.stringify(data)).toBeNull();
  });

  it('ignores inherited properties and refuses prototype tricks', () => {
    const sneaky = JSON.parse('{"t":"resign","__proto__":{"winner":"w"}}');
    expect(parseMessage(sneaky)).toBeNull();
    const inherited = Object.create({ ply: 0 });
    Object.assign(inherited, { t: 'move', uci: 'e2e4' });
    expect(parseMessage(inherited)).toBeNull();
  });

  it('returns fresh objects, never the received ones', () => {
    const moves = ['e2e4'];
    const parsed = parseMessage({ t: 'sync', moves, clocks: { w: 0, b: 0 } });
    expect(parsed).not.toBeNull();
    moves.push('e7e5');
    expect(parsed && parsed.t === 'sync' && parsed.moves).toEqual(['e2e4']);
  });

  it('cleans the name in a hello', () => {
    const parsed = parseMessage({ t: 'hello', v: PROTOCOL_VERSION, name: ' <b>Ana</b>\u202e ' });
    expect(parsed).toEqual({ t: 'hello', v: PROTOCOL_VERSION, name: '<b>Ana</b>' });
  });
});

describe('cleanName', () => {
  it('removes control and direction characters, collapses spaces and cuts to length', () => {
    expect(cleanName('  Ana\u0000 \n Bell\u200f ')).toBe('Ana Bell');
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanName('\u202e\u0007')).toBe('Friend');
    expect(cleanName('', 'You')).toBe('You');
  });
});

describe('invitation links', () => {
  it('carries only the secret, after the bare page address', () => {
    const invite = createInvite();
    expect(isInvite(invite)).toBe(true);
    const url = inviteUrl('https://example.org/game/?ui=modern&debug=1#old', invite);
    expect(url).toBe(`https://example.org/game/#g=${invite.secret}`);
    expect(parseInvite(new URL(url).hash)).toEqual(invite);
    expect(createInvite()).not.toEqual(invite);
    expect(createToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('stays short: about 67 characters on the published site', () => {
    const url = inviteUrl('https://slaviboy.github.io/grandmaster-3d/', createInvite());
    expect(url.length).toBe(67);
  });

  it('derives the same room for both players, a different one for every game', async () => {
    const invite = createInvite();
    const room = await roomFor(invite);
    expect(await roomFor({ ...invite })).toBe(room);
    expect(room).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(room).not.toContain(invite.secret);
    expect(await roomFor(createInvite())).not.toBe(room);
  });

  it('accepts only the exact form', () => {
    const { secret } = createInvite();
    for (const hash of [
      '',
      '#g=',
      `#g=${secret}x`,
      `#g=${secret}&x=1`,
      `#g=${secret.slice(1)}<`,
      `#G=${secret}`,
      `#play=${secret}`,
      `#g=${secret}.${secret}`,
    ]) {
      expect(parseInvite(hash), hash).toBeNull();
    }
  });
});

describe('parseSaved', () => {
  const good = {
    invite: createInvite(),
    role: 'guest',
    token: SAMPLE_ID,
    name: 'Ben',
    friendName: 'Ana',
    color: 'b',
    minutes: 5,
    moves: ['e2e4', 'e7e5'],
    clocks: { w: 1200, b: 800 },
  };

  it('reads back a saved game', () => {
    expect(parseSaved(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('treats anything malformed as nothing', () => {
    for (const patch of [
      { role: 'admin' },
      { token: 'x' },
      { color: 'red' },
      { minutes: 7 },
      { moves: ['e2e4', 'castle'] },
      { clocks: { w: -1, b: 0 } },
      { invite: { secret: 's' } },
    ]) {
      expect(parseSaved({ ...good, ...patch }), JSON.stringify(patch)).toBeNull();
    }
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('saved')).toBeNull();
  });
});
