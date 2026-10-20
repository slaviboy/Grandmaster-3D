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
  CLAIM_AFTER_MS,
  CONNECT_TIMEOUT_MS,
  MAX_LAG_ALLOWANCE_MS,
  OnlineSession,
  PING_EVERY_MS,
  type SessionEvent,
} from '../../src/net/OnlineSession.ts';
import { MemoryLink, plug, settle, unplug } from '../support/memoryLink.ts';
import type { ManualTimers } from '../support/onlineSides.ts';
import { device, invite } from '../support/onlineSides.ts';

/** A host (White unless told otherwise) and a guest, connected and set up. */
async function game(color: 'w' | 'b' = 'w', minutes = 5) {
  const a = device();
  const b = device();
  const links = { host: new MemoryLink(), guest: new MemoryLink() };
  const host = OnlineSession.host({
    link: links.host,
    game: a.game,
    invite,
    name: 'Ana',
    color,
    minutes,
    timers: a.timers,
    storage: a.storage,
  });
  const guest = OnlineSession.join({
    link: links.guest,
    game: b.game,
    invite,
    name: 'Ben',
    timers: b.timers,
    storage: b.storage,
  });
  const events: Record<'host' | 'guest', SessionEvent['kind'][]> = { host: [], guest: [] };
  host.onEvent((e) => events.host.push(e.kind));
  guest.onEvent((e) => events.guest.push(e.kind));
  plug(links.host, links.guest);
  await settle();
  return { a, b, host, guest, links, events };
}

/** Leaves, letting the goodbye's short wait pass. */
async function leave(session: OnlineSession, timers: ManualTimers) {
  const leaving = session.leave();
  await settle();
  timers.advance(1_000);
  await leaving;
  await settle();
}

describe('OnlineSession', () => {
  it('sets up a game: the host keeps its colour, the guest takes the other, names cross', async () => {
    const { a, b, host, guest, events } = await game('b', 10);
    expect(a.starts).toEqual([{ color: 'b', minutes: 10 }]);
    expect(b.starts).toEqual([{ color: 'w', minutes: 10 }]);
    expect(host.state.get()).toMatchObject({ status: 'playing', friendName: 'Ben', myColor: 'b' });
    expect(guest.state.get()).toMatchObject({ status: 'playing', friendName: 'Ana', myColor: 'w' });
    expect(events.host).toEqual(['joined']);
    expect(events.guest).toEqual(['joined']);
    expect(b.controller.currentPhase).toBe('playerTurn');
    expect(a.controller.currentPhase).toBe('remoteTurn');
  });

  it('carries moves both ways, so both boards agree', async () => {
    const { a, b } = await game();
    await a.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    await b.controller.playerMove({ from: 'c7', to: 'c5' });
    await settle();
    await a.controller.playerMove({ from: 'g1', to: 'f3' });
    await settle();
    expect(a.history()).toEqual(['e4', 'c5', 'Nf3']);
    expect(b.history()).toEqual(['e4', 'c5', 'Nf3']);
    expect(b.controller.game.fen()).toBe(a.controller.game.fen());
  });

  it('gives back the measured network delay, capped', async () => {
    const { a, b, links } = await game();
    links.host.rtt = 900;
    a.timers.advance(PING_EVERY_MS);
    await settle();
    await a.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    a.advance(5_000);
    await b.controller.playerMove({ from: 'e7', to: 'e5' });
    await settle();
    expect(a.controller.clock.elapsed('b')).toBe(5_000 - MAX_LAG_ALLOWANCE_MS);
  });

  it('agrees a draw only when both ask, and a move withdraws the offer', async () => {
    const { a, b, host, guest, events } = await game();
    await host.offerDraw();
    await settle();
    expect(guest.state.get().drawOffer).toBe('received');
    expect(events.guest).toContain('drawOffered');
    await a.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    expect(guest.state.get().drawOffer).toBe('none');
    expect(host.state.get().drawOffer).toBe('none');

    await guest.offerDraw();
    await settle();
    await host.offerDraw();
    await settle();
    const draw = { kind: 'draw', reason: 'agreement' };
    expect(a.controller.state.get().status).toEqual(draw);
    expect(b.controller.state.get().status).toEqual(draw);
  });

  it('passes on a resignation and a falling flag', async () => {
    let s = await game();
    await s.b.controller.resign();
    await settle();
    expect(s.a.controller.state.get().status).toEqual({ kind: 'resigned', winner: 'w' });

    s = await game('w', 5);
    await s.a.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    await s.b.controller.playerMove({ from: 'e7', to: 'e5' });
    await settle();
    s.a.advance(5 * 60_000);
    s.a.controller.tick();
    await settle();
    expect(s.b.controller.state.get().status).toEqual({ kind: 'timeout', winner: 'b' });
  });

  it('plays a rematch with the colours swapped once both ask', async () => {
    const { a, b, host, guest } = await game('w');
    await b.controller.resign();
    await settle();
    await host.requestRematch();
    await settle();
    expect(guest.state.get().rematch).toBe('received');
    await guest.requestRematch();
    await settle();
    expect(host.state.get().myColor).toBe('b');
    expect(guest.state.get().myColor).toBe('w');
    expect(a.controller.state.get().humanColor).toBe('b');
    expect(b.controller.currentPhase).toBe('playerTurn');
  });

  it('rides out a dropped connection, and resends a move the host missed', async () => {
    const { a, b, host, guest, links, events } = await game();
    await a.controller.playerMove({ from: 'e2', to: 'e4' });
    await settle();
    unplug(links.host, links.guest);
    await settle();
    expect(host.state.get().status).toBe('away');
    expect(events.host).toContain('away');
    // The guest moves while the host cannot hear it.
    await b.controller.playerMove({ from: 'e7', to: 'e5' });
    await settle();
    expect(a.history()).toEqual(['e4']);
    plug(links.host, links.guest);
    await settle();
    expect(host.state.get().status).toBe('playing');
    expect(guest.state.get().status).toBe('playing');
    expect(events.host).toContain('returned');
    expect(a.history()).toEqual(['e4', 'e5']);
    expect(b.history()).toEqual(['e4', 'e5']);
  });

  it('lets a reloaded guest rejoin with its token and catch up from the host', async () => {
    const { a, b, links, host } = await game();
    await a.controller.playerMove({ from: 'd2', to: 'd4' });
    await settle();
    const saved = b.storage.saved!;
    expect(saved.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    unplug(links.host, links.guest);
    await settle();

    const c = device();
    const again = new MemoryLink();
    const guest = OnlineSession.resume(saved, { link: again, game: c.game, timers: c.timers });
    plug(links.host, again);
    await settle();
    expect(host.state.get().status).toBe('playing');
    expect(guest.state.get()).toMatchObject({ status: 'playing', myColor: 'b' });
    expect(c.history()).toEqual(['d4']);
    await c.controller.playerMove({ from: 'd7', to: 'd5' });
    await settle();
    expect(a.history()).toEqual(['d4', 'd5']);
  });

  it('a host that reloads picks its own game back up and waits for the guest', async () => {
    const { a, links } = await game();
    await a.controller.playerMove({ from: 'c2', to: 'c4' });
    await settle();
    const saved = a.storage.saved!;
    unplug(links.host, links.guest);
    const c = device();
    const host = OnlineSession.resume(saved, {
      link: new MemoryLink(),
      game: c.game,
      timers: c.timers,
    });
    await settle();
    expect(host.state.get().status).toBe('away');
    expect(c.history()).toEqual(['c4']);
    expect(c.controller.currentPhase).toBe('remoteTurn');
  });

  it('turns away a stranger who comes with the link but without the token', async () => {
    const { a, host, links } = await game();
    unplug(links.host, links.guest);
    await settle();
    const stranger = new MemoryLink();
    plug(links.host, stranger);
    await settle();
    stranger.sendRaw({ t: 'hello', v: 1, name: 'Eve' });
    await settle();
    expect(links.host.kicked).toBe(true);
    expect(host.state.get()).toMatchObject({ status: 'away', friendName: 'Ben' });
    expect(a.starts).toHaveLength(1);
  });

  it('a guest turns away a stranger posing as the host', async () => {
    const { b, guest, links } = await game();
    unplug(links.host, links.guest);
    await settle();
    const stranger = new MemoryLink();
    plug(stranger, links.guest);
    await settle();
    stranger.sendRaw({ t: 'hello', v: 1, name: 'Mallory' });
    stranger.sendRaw({ t: 'sync', moves: ['e2e4'], clocks: { w: 0, b: 0 } });
    await settle();
    expect(links.guest.kicked).toBe(true);
    expect(guest.state.get().friendName).toBe('Ana');
    expect(b.history()).toEqual([]);
  });

  it('awards the game when the other player leaves mid-game', async () => {
    const { a, b, host, guest, events } = await game();
    await leave(guest, b.timers);
    expect(a.controller.state.get().status).toEqual({ kind: 'resigned', winner: 'w' });
    expect(host.state.get()).toMatchObject({ status: 'closed', message: 'Ben left the game.' });
    expect(events.host).toContain('left');
  });

  it('in an untimed game, lets the win be claimed after the other player is gone a while', async () => {
    const { a, host, links } = await game('w', 0);
    unplug(links.host, links.guest);
    await settle();
    a.timers.advance(CLAIM_AFTER_MS - 1);
    expect(host.state.get().canClaimWin).toBe(false);
    a.timers.advance(1);
    expect(host.state.get().canClaimWin).toBe(true);
    await host.claimWin();
    expect(a.controller.state.get().status).toEqual({
      kind: 'forfeit',
      winner: 'w',
      reason: 'abandoned',
    });
  });

  it('a guest that cannot find the game gives up with a message', async () => {
    const b = device();
    const guest = OnlineSession.join({
      link: new MemoryLink(),
      game: b.game,
      invite,
      name: 'Ben',
      timers: b.timers,
    });
    b.timers.advance(CONNECT_TIMEOUT_MS);
    await settle();
    expect(guest.state.get().status).toBe('failed');
    expect(guest.state.get().message).toMatch(/Couldn't reach the game/);
  });

  it('forgets the saved game when the session closes', async () => {
    const { b, guest } = await game();
    expect(b.storage.saved).not.toBeNull();
    await leave(guest, b.timers);
    expect(b.storage.saved).toBeNull();
  });
});
