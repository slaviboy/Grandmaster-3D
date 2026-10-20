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

// A modified client attacks an honest player. The test speaks for the attacker with raw data;
// whatever it sends, the honest board, history and clocks change only as the rules allow.

import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../../src/net/PeerGuard.ts';
import { OnlineSession } from '../../src/net/OnlineSession.ts';
import { MemoryLink, plug, settle } from '../support/memoryLink.ts';
import { device, invite } from '../support/onlineSides.ts';

/** Made-up seat ids in the token format, for an attacker's messages. */
const SEAT_ID = 'Mallory-seat-123456789';
const SAMPLE_ID = 'abcdefghijklmnopqrstuv';

/** An honest host playing White against an attacker who has just sat down as Black. */
async function honestHost(minutes = 5) {
  const me = device();
  const link = new MemoryLink();
  const evil = new MemoryLink();
  const session = OnlineSession.host({
    link,
    game: me.game,
    invite,
    name: 'Ana',
    color: 'w',
    minutes,
    timers: me.timers,
  });
  plug(link, evil);
  await settle();
  evil.sendRaw({ t: 'hello', v: 1, name: 'Eve' });
  await settle();
  const before = () => ({
    fen: me.controller.game.fen(),
    history: me.history(),
    clocks: me.controller.clock.usedTimes(),
  });
  return { me, link, evil, session, before };
}

/** An honest guest against an attacker hosting as White. */
async function honestGuest() {
  const me = device();
  const link = new MemoryLink();
  const evil = new MemoryLink();
  const session = OnlineSession.join({
    link,
    game: me.game,
    invite,
    name: 'Ben',
    timers: me.timers,
  });
  plug(evil, link);
  await settle();
  const token = SEAT_ID;
  evil.sendRaw({ t: 'hello', v: 1, name: 'Mallory' });
  evil.sendRaw({ t: 'setup', hostColor: 'w', minutes: 5, token });
  await settle();
  return { me, link, evil, session, token };
}

function expectForfeit(
  s: Awaited<ReturnType<typeof honestHost>>,
  reason: 'invalid-move' | 'invalid-data',
) {
  expect(s.me.controller.state.get().status).toEqual({ kind: 'forfeit', winner: 'w', reason });
  expect(s.link.kicked).toBe(true);
  expect(s.session.state.get().status).toBe('closed');
  expect(s.session.state.get().message).toMatch(/^Game ended: Eve's app /);
}

describe('an attacker against an honest player', () => {
  it('an illegal move loses the game and the connection, and the board stays as it was', async () => {
    const s = await honestHost();
    await s.me.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    const position = s.before();
    s.evil.sendRaw({ t: 'move', uci: 'e7e4', ply: 1 });
    await settle();
    expectForfeit(s, 'invalid-move');
    expect(s.me.controller.game.fen()).toBe(position.fen);
    expect(s.me.history()).toEqual(['e4']);
  });

  it('a move out of turn forfeits', async () => {
    const s = await honestHost();
    s.evil.sendRaw({ t: 'move', uci: 'e7e5', ply: 0 });
    await settle();
    expectForfeit(s, 'invalid-move');
    expect(s.me.history()).toEqual([]);
  });

  it("a move with the honest player's pieces forfeits", async () => {
    const s = await honestHost();
    await s.me.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    s.evil.sendRaw({ t: 'move', uci: 'd2d4', ply: 1 });
    await settle();
    expectForfeit(s, 'invalid-move');
  });

  it('a repeated move forfeits', async () => {
    const s = await honestHost();
    await s.me.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    s.evil.sendRaw({ t: 'move', uci: 'e7e5', ply: 1 });
    s.evil.sendRaw({ t: 'move', uci: 'e7e5', ply: 1 });
    await settle();
    expectForfeit(s, 'invalid-move');
    expect(s.me.history()).toEqual(['e4', 'e5']);
  });

  it('cannot change any clock: extra fields are dropped and its flag messages are its own', async () => {
    const s = await honestHost();
    await s.me.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    s.me.advance(4_000);
    const clocks = s.before().clocks;
    s.evil.sendRaw({ t: 'move', uci: 'e7e5', ply: 1, clock: 0 });
    s.evil.sendRaw({ t: 'sync', moves: [], clocks: { w: 999_999, b: 0 } });
    await settle();
    expect(s.me.controller.clock.usedTimes()).toEqual(clocks);
    expect(s.me.history()).toEqual(['e4']);
    s.evil.sendRaw({ t: 'flag' });
    await settle();
    expect(s.me.controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
  });

  it('the attacker runs out of time on the honest clock, whatever it says', async () => {
    const s = await honestHost(5);
    await s.me.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    s.me.advance(5 * 60_000 + 1_000);
    s.me.controller.tick();
    await settle();
    expect(s.me.controller.state.get().status).toEqual({ kind: 'timeout', winner: 'w' });
    s.evil.sendRaw({ t: 'move', uci: 'e7e5', ply: 1 });
    await settle();
    expect(s.me.history()).toEqual(['e4']);
  });

  it("a host cannot rewrite the guest's game with a sync", async () => {
    const s = await honestGuest();
    s.evil.sendRaw({ t: 'move', uci: 'e2e4', ply: 0 });
    await settle();
    await s.me.controller.playerMove({ from: 'e7', to: 'e5' });
    await settle();
    s.evil.sendRaw({ t: 'sync', moves: ['d2d4', 'd7d5', 'c2c4'], clocks: { w: 0, b: 0 } });
    await settle();
    expect(s.me.controller.state.get().status).toEqual({
      kind: 'forfeit',
      winner: 'b',
      reason: 'invalid-data',
    });
    expect(s.me.history()).toEqual(['e4', 'e5']);
    expect(s.link.kicked).toBe(true);
  });

  it('a guest cannot send a sync or new terms to the host', async () => {
    const s = await honestHost();
    s.evil.sendRaw({ t: 'sync', moves: ['e2e4', 'e7e5'], clocks: { w: 0, b: 0 } });
    s.evil.sendRaw({ t: 'setup', hostColor: 'b', minutes: 30, token: SAMPLE_ID });
    await settle();
    expect(s.me.history()).toEqual([]);
    expect(s.me.controller.state.get()).toMatchObject({ humanColor: 'w', minutes: 5 });
    expect(s.session.state.get()).toMatchObject({ myColor: 'w', minutes: 5, status: 'playing' });
  });

  it('a host cannot change the colours or time once the game is set up', async () => {
    const s = await honestGuest();
    s.evil.sendRaw({ t: 'setup', hostColor: 'b', minutes: 30, token: s.token });
    await settle();
    expect(s.session.state.get()).toMatchObject({ myColor: 'b', minutes: 5 });
    expect(s.me.starts).toEqual([{ color: 'b', minutes: 5 }]);
  });

  it('can only resign for itself, and a lone draw message is just an offer', async () => {
    let s = await honestHost();
    s.evil.sendRaw({ t: 'draw' });
    await settle();
    expect(s.me.controller.state.get().status.kind).toBe('playing');
    expect(s.session.state.get().drawOffer).toBe('received');
    s.evil.sendRaw({ t: 'resign' });
    await settle();
    expect(s.me.controller.state.get().status).toEqual({ kind: 'resigned', winner: 'w' });

    s = await honestHost();
    s.evil.sendRaw({ t: 'resign', winner: 'b' });
    await settle();
    expect(s.me.controller.state.get().status.kind).toBe('playing');
  });

  it('a name is only ever text, without control or direction characters', async () => {
    const s = await honestHost();
    expect(s.session.state.get().friendName).toBe('Eve');
    const t = await honestGuest();
    expect(t.session.state.get().friendName).toBe('Mallory');
    const me = device();
    const link = new MemoryLink();
    const evil = new MemoryLink();
    const session = OnlineSession.host({
      link,
      game: me.game,
      invite,
      name: 'Ana',
      color: 'w',
      minutes: 0,
      timers: me.timers,
    });
    plug(link, evil);
    await settle();
    evil.sendRaw({ t: 'hello', v: 1, name: '<b onclick=x>Eve</b>\u202e\u0000' });
    await settle();
    expect(session.state.get().friendName).toBe('<b onclick=x>Eve</b>');
  });

  it('a flood of bad data is dropped, then the attacker is disconnected and loses', async () => {
    const s = await honestHost();
    s.evil.sendRaw({ t: 'hello', v: 1, name: 'x'.repeat(10_000) });
    await settle();
    expect(s.session.state.get().status).toBe('playing');
    for (let i = 1; i < DEFAULT_LIMITS.maxDrops; i++) s.evil.sendRaw({ t: 'nonsense', i });
    await settle();
    expectForfeit(s, 'invalid-data');
    expect(s.me.history()).toEqual([]);
  });

  it('nothing counts before the attacker says hello', async () => {
    const me = device();
    const link = new MemoryLink();
    const evil = new MemoryLink();
    OnlineSession.host({
      link,
      game: me.game,
      invite,
      name: 'Ana',
      color: 'w',
      minutes: 5,
      timers: me.timers,
    });
    plug(link, evil);
    await settle();
    evil.sendRaw({ t: 'resign' });
    evil.sendRaw({ t: 'move', uci: 'e2e4', ply: 0 });
    await settle();
    expect(me.starts).toEqual([]);
    expect(me.controller.state.get().status.kind).toBe('playing');
  });
});
