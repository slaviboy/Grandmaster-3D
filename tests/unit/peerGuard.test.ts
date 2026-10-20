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
import { DEFAULT_LIMITS, PeerGuard } from '../../src/net/PeerGuard.ts';

function guard() {
  let time = 0;
  return { guard: new PeerGuard(() => time), advance: (ms: number) => (time += ms) };
}

const move = { t: 'move', uci: 'e2e4', ply: 0 };

describe('PeerGuard', () => {
  it('lets well-formed messages through', () => {
    const { guard: g } = guard();
    expect(g.check(move)).toEqual({ ok: true, message: move });
    expect(g.drops).toBe(0);
  });

  it('drops malformed data and counts it', () => {
    const { guard: g } = guard();
    for (const data of [null, 'e2e4', 42, { t: 'move' }, { t: 'resign', extra: 1 }]) {
      expect(g.check(data)).toMatchObject({ ok: false, disconnect: false });
    }
    expect(g.drops).toBe(5);
  });

  it('drops a message over the size limit before reading it', () => {
    const { guard: g } = guard();
    const huge = { t: 'hello', v: 1, name: 'x'.repeat(DEFAULT_LIMITS.maxBytes) };
    expect(g.check(huge)).toMatchObject({ ok: false, reason: 'size' });
  });

  it('drops a flood beyond the burst, then lets messages through at the average rate', () => {
    const { guard: g, advance } = guard();
    for (let i = 0; i < DEFAULT_LIMITS.burst; i++) expect(g.check({ t: 'draw' }).ok).toBe(true);
    expect(g.check({ t: 'draw' })).toMatchObject({ ok: false, reason: 'rate' });
    advance(1000 / DEFAULT_LIMITS.perSecond);
    expect(g.check({ t: 'draw' }).ok).toBe(true);
  });

  it('asks to disconnect a peer that keeps sending bad data', () => {
    const { guard: g } = guard();
    let last = g.check(null);
    for (let i = 1; i < DEFAULT_LIMITS.maxDrops; i++) last = g.check(null);
    expect(last).toMatchObject({ ok: false, disconnect: true });
  });

  it('survives data that cannot be measured', () => {
    const { guard: g } = guard();
    const cyclic: Record<string, unknown> = { t: 'resign' };
    cyclic.self = cyclic;
    expect(g.check(cyclic)).toMatchObject({ ok: false, reason: 'size' });
    expect(g.check({ t: 'resign', n: 10n })).toMatchObject({ ok: false, reason: 'size' });
  });
});
