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

import { Chess } from 'chess.js';
import { afterEach, describe, expect, it } from 'vitest';
import { difficulty } from '../../src/engine/difficulty.ts';
import { StockfishAdapter } from '../../src/engine/StockfishAdapter.ts';
import { FakeTransport } from '../support/FakeTransport.ts';
import { NodeProcessTransport, engineScript } from '../support/NodeProcessTransport.ts';

const go = { movetime: 50 };

describe('StockfishAdapter with a scripted engine', () => {
  it('completes the handshake and lists the options', async () => {
    const fake = new FakeTransport();
    const adapter = new StockfishAdapter(() => fake);
    const info = await adapter.init();
    expect(info.name).toBe('Fake Engine');
    expect(info.options.has('UCI_Elo')).toBe(true);
    expect(fake.sent.slice(0, 2)).toEqual(['uci', 'isready']);
  });

  it('times out when the engine never answers', async () => {
    const fake = new FakeTransport();
    fake.respond = () => {};
    const adapter = new StockfishAdapter(() => fake, { initTimeoutMs: 30 });
    await expect(adapter.init()).rejects.toThrow('did not answer');
  });

  it('sends only changed, supported options, and never during a search', async () => {
    const fake = new FakeTransport();
    const base = fake.respond;
    fake.respond = (command, f) => {
      base(command, f);
      if (command.startsWith('go')) setTimeout(() => f.emit('bestmove e2e4'), 5);
    };
    const adapter = new StockfishAdapter(() => fake);
    const options = { 'Skill Level': 3, MultiPV: 4, Unknown: 1 };
    await adapter.search({ position: 'position startpos', options, go });
    await adapter.search({ position: 'position startpos', options, go });
    const sets = fake.sent.filter((c) => c.startsWith('setoption'));
    expect(sets).toEqual(['setoption name Skill Level value 3', 'setoption name MultiPV value 4']);
    // Each setoption comes before the go of its search.
    const firstGo = fake.sent.indexOf('go movetime 50');
    expect(fake.sent.indexOf('setoption name MultiPV value 4')).toBeLessThan(firstGo);
  });

  it('collects multipv lines and returns the best move', async () => {
    const fake = new FakeTransport();
    const base = fake.respond;
    fake.respond = (command, f) => {
      base(command, f);
      if (command.startsWith('go')) {
        f.emit('info depth 3 multipv 1 score cp 30 pv e2e4 e7e5');
        f.emit('info depth 3 multipv 2 score cp 10 pv d2d4');
        f.emit('bestmove e2e4 ponder e7e5');
      }
    };
    const adapter = new StockfishAdapter(() => fake);
    const result = await adapter.search({ position: 'position startpos', options: {}, go });
    expect(result).toMatchObject({ bestmove: 'e2e4', cancelled: false });
    expect(result.lines.map((l) => l.pv[0])).toEqual(['e2e4', 'd2d4']);
  });

  it("waits for the stopped search's bestmove even when readyok arrives first", async () => {
    const fake = new FakeTransport();
    const base = fake.respond;
    fake.respond = (command, f) => {
      base(command, f); // answers isready at once
      if (command === 'stop') setTimeout(() => f.emit('bestmove a2a3'), 20);
    };
    const adapter = new StockfishAdapter(() => fake);
    const pending = adapter.search({
      position: 'position startpos',
      options: {},
      go: { movetime: 60000 },
    });
    await new Promise((r) => setTimeout(r, 10));
    let cancelled = false;
    const stopping = adapter.cancel().then(() => (cancelled = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(cancelled).toBe(false); // still waiting for that bestmove
    await stopping;
    expect(await pending).toMatchObject({ bestmove: null, cancelled: true });
  });

  it('drops searches that were still queued when cancelled', async () => {
    const fake = new FakeTransport();
    const base = fake.respond;
    fake.respond = (command, f) => {
      base(command, f);
      if (command === 'stop') f.emit('bestmove a2a3');
    };
    const adapter = new StockfishAdapter(() => fake);
    const first = adapter.search({
      position: 'position startpos',
      options: {},
      go: { movetime: 60000 },
    });
    const second = adapter.search({ position: 'position startpos moves e2e4', options: {}, go });
    await new Promise((r) => setTimeout(r, 10));
    await adapter.cancel();
    expect(await first).toMatchObject({ cancelled: true });
    expect(await second).toMatchObject({ cancelled: true, bestmove: null });
    expect(fake.sent.filter((c) => c.startsWith('go'))).toHaveLength(1);
  });

  it('restarts an engine that ignores stop', async () => {
    const transports: FakeTransport[] = [];
    const adapter = new StockfishAdapter(
      () => {
        const fake = new FakeTransport();
        transports.push(fake);
        return fake;
      },
      { watchdogGraceMs: 20 },
    );
    const result = await adapter.search({
      position: 'position startpos',
      options: { MultiPV: 2 },
      go: { movetime: 10 },
    });
    expect(result).toMatchObject({
      bestmove: null,
      cancelled: true,
      error: 'the engine stopped responding',
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(transports).toHaveLength(2);
    expect(transports[0]!.terminated).toBe(true);
  });

  it('reports a crash as an error result', async () => {
    const fake = new FakeTransport();
    const adapter = new StockfishAdapter(() => fake);
    const pending = adapter.search({
      position: 'position startpos',
      options: {},
      go: { movetime: 60000 },
    });
    await new Promise((r) => setTimeout(r, 10));
    fake.fail('worker crashed');
    expect(await pending).toMatchObject({ cancelled: true, error: 'worker crashed' });
  });
});

const script = engineScript();

describe.skipIf(!script)('StockfishAdapter with the real lite engine', () => {
  let adapter: StockfishAdapter;
  afterEach(() => adapter?.dispose());

  const make = () => (adapter = new StockfishAdapter(() => new NodeProcessTransport(script!)));

  it('answers the handshake with the options the presets rely on', async () => {
    const info = await make().init();
    expect(info.name).toMatch(/Stockfish/);
    for (const name of ['Skill Level', 'UCI_LimitStrength', 'UCI_Elo', 'MultiPV', 'Hash']) {
      expect(info.options.has(name), name).toBe(true);
    }
  });

  it('plays a legal move for every difficulty', async () => {
    make();
    const chess = new Chess();
    chess.move('e4');
    for (const id of ['beginner', 'easy', 'medium', 'hard', 'expert', 'maximum'] as const) {
      const preset = difficulty(id);
      const result = await adapter.search({
        position: 'position startpos moves e2e4',
        options: preset.options,
        go: { ...preset.go, movetime: Math.min(preset.go.movetime ?? 200, 200) },
      });
      expect(result.cancelled, id).toBe(false);
      const legal = chess.moves({ verbose: true }).map((m) => m.lan);
      expect(legal, id).toContain(result.bestmove);
      if (preset.policy) expect(result.lines.length, id).toBeGreaterThan(1);
    }
  });

  it('has no move in a mated position', async () => {
    make();
    const result = await adapter.search({
      position: 'position fen rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      options: {},
      go: { movetime: 100 },
    });
    expect(result).toMatchObject({ bestmove: null, cancelled: false });
  });

  it('cancels a long search and then answers for the new position', async () => {
    make();
    await adapter.init();
    const long = adapter.search({
      position: 'position startpos',
      options: {},
      go: { movetime: 20000 },
    });
    await new Promise((r) => setTimeout(r, 150));
    const started = Date.now();
    await adapter.cancel();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await long).toMatchObject({ cancelled: true, bestmove: null });
    const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    const next = await adapter.search({
      position: 'position startpos moves e2e4 e7e5',
      options: {},
      go: { movetime: 100 },
    });
    expect(chess.moves({ verbose: true }).map((m) => m.lan)).toContain(next.bestmove);
  });

  it('runs many searches in a row on one engine', async () => {
    make();
    for (let i = 0; i < 20; i++) {
      const result = await adapter.search({
        position: 'position startpos',
        options: {},
        go: { movetime: 20 },
      });
      expect(result.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
    }
  });
});
