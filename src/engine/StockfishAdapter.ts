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

// Drives Stockfish over UCI. Commands run one at a time through a queue, so options never change
// in the middle of a search. A cancelled search is stopped and its final "bestmove" awaited before
// anything else is sent (Stockfish can answer "isready" before that bestmove, so readyok is not a
// safe signal). A watchdog restarts the engine if it ever stops answering.

import type { EngineTransport } from './EngineTransport.ts';
import type { GoLimits, UciOptions } from './difficulty.ts';
import { parseBestmove, parseInfo, parseOption, type PvLine, type UciOption } from './uci.ts';

export interface EngineInfo {
  readonly name: string;
  readonly options: ReadonlyMap<string, UciOption>;
}

export interface SearchRequest {
  /** A full UCI position command, e.g. "position startpos moves e2e4". */
  readonly position: string;
  readonly options: UciOptions;
  readonly go: GoLimits;
}

export interface SearchResult {
  /** The engine's move in UCI form, or null when it has none or the search was cancelled. */
  readonly bestmove: string | null;
  /** The latest line for each MultiPV slot, best first. */
  readonly lines: readonly PvLine[];
  readonly cancelled: boolean;
  readonly error?: string;
}

export interface EnginePort {
  init(): Promise<EngineInfo>;
  newGame(): Promise<void>;
  search(request: SearchRequest): Promise<SearchResult>;
  cancel(): Promise<void>;
  dispose(): void;
}

interface ActiveSearch {
  readonly lines: Map<number, PvLine>;
  readonly done: Promise<SearchResult>;
  resolve: (result: SearchResult) => void;
  cancelled: boolean;
  timers: Array<ReturnType<typeof setTimeout>>;
}

export interface AdapterOptions {
  readonly initTimeoutMs?: number;
  /** Extra time past a search's own limit before the watchdog steps in. */
  readonly watchdogGraceMs?: number;
}

export class StockfishAdapter implements EnginePort {
  private transport: EngineTransport | null = null;
  private unsubscribe: Array<() => void> = [];
  private info: EngineInfo | null = null;
  private starting: Promise<EngineInfo> | null = null;
  private readonly applied = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private active: ActiveSearch | null = null;
  private epoch = 0;
  private readonly waiters = new Set<(line: string) => void>();
  private readonly initTimeoutMs: number;
  private readonly graceMs: number;
  private disposed = false;

  constructor(
    private readonly createTransport: () => EngineTransport,
    options: AdapterOptions = {},
  ) {
    this.initTimeoutMs = options.initTimeoutMs ?? 20000;
    this.graceMs = options.watchdogGraceMs ?? 3000;
  }

  /** Starts the engine and completes the UCI handshake (once; later calls share the result). */
  init(): Promise<EngineInfo> {
    if (!this.starting) {
      this.starting = this.start().catch((error: unknown) => {
        this.starting = null;
        throw error;
      });
    }
    return this.starting;
  }

  get engineInfo(): EngineInfo | null {
    return this.info;
  }

  get searching(): boolean {
    return this.active !== null;
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
      this.send('ucinewgame');
      await this.ready();
    });
  }

  /**
   * Searches a position. If cancel() is called first (even while this request is still queued),
   * the result comes back with cancelled set and no move.
   */
  search(request: SearchRequest): Promise<SearchResult> {
    const epoch = this.epoch;
    return this.enqueue(async () => {
      if (epoch !== this.epoch || this.disposed)
        return { bestmove: null, lines: [], cancelled: true };
      await this.init();
      await this.applyOptions(request.options);
      if (epoch !== this.epoch) return { bestmove: null, lines: [], cancelled: true };
      return this.runSearch(request);
    });
  }

  /** Stops the running search and drops queued ones; resolves once the engine is idle. */
  async cancel(): Promise<void> {
    this.epoch++;
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    this.send('stop');
    await active.done;
  }

  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.finish({ bestmove: null, lines: [], cancelled: true });
    this.shutdown();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async start(): Promise<EngineInfo> {
    this.shutdown();
    const transport = this.createTransport();
    this.transport = transport;
    this.applied.clear();
    this.unsubscribe = [
      transport.onLine((line) => this.onLine(line)),
      transport.onError((message) => this.onEngineError(message)),
    ];
    let name = 'UCI engine';
    const options = new Map<string, UciOption>();
    const collect = (line: string) => {
      if (line.startsWith('id name ')) name = line.slice(8).trim();
      const option = parseOption(line);
      if (option) options.set(option.name, option);
    };
    this.waiters.add(collect);
    try {
      this.send('uci');
      await this.waitFor(
        (line) => line.trim() === 'uciok',
        this.initTimeoutMs,
        'the engine did not answer "uci"',
      );
    } finally {
      this.waiters.delete(collect);
    }
    this.info = { name, options };
    await this.ready();
    return this.info;
  }

  private shutdown(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.transport?.terminate();
    this.transport = null;
  }

  private send(command: string): void {
    this.transport?.send(command);
  }

  private ready(): Promise<string> {
    this.send('isready');
    return this.waitFor(
      (line) => line.trim() === 'readyok',
      this.initTimeoutMs,
      'the engine is not ready',
    );
  }

  private waitFor(
    match: (line: string) => boolean,
    timeoutMs: number,
    message: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter = (line: string) => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(line);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(message));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  private async applyOptions(options: UciOptions): Promise<void> {
    let changed = false;
    for (const [name, raw] of Object.entries(options)) {
      if (!this.info?.options.has(name)) continue; // this build does not offer it
      const value = String(raw);
      if (this.applied.get(name) === value) continue;
      this.send(`setoption name ${name} value ${value}`);
      this.applied.set(name, value);
      changed = true;
    }
    if (changed) await this.ready();
  }

  private runSearch(request: SearchRequest): Promise<SearchResult> {
    let resolve!: (result: SearchResult) => void;
    const done = new Promise<SearchResult>((r) => (resolve = r));
    const active: ActiveSearch = { lines: new Map(), done, resolve, cancelled: false, timers: [] };
    this.active = active;

    const go = ['go'];
    if (request.go.depth !== undefined) go.push('depth', String(request.go.depth));
    if (request.go.movetime !== undefined) go.push('movetime', String(request.go.movetime));
    this.send(request.position);
    this.send(go.join(' '));

    // Watchdog: ask it to stop a little after its limit, and restart it if even that is ignored.
    const limit = request.go.movetime ?? 15000;
    active.timers.push(
      setTimeout(() => {
        if (this.active !== active) return;
        this.send('stop');
        active.timers.push(
          setTimeout(() => {
            if (this.active !== active) return;
            this.finish({
              bestmove: null,
              lines: [],
              cancelled: true,
              error: 'the engine stopped responding',
            });
            this.starting = null;
            void this.init().catch(() => undefined);
          }, this.graceMs),
        );
      }, limit + this.graceMs),
    );
    return done;
  }

  private finish(result: SearchResult): void {
    const active = this.active;
    if (!active) return;
    for (const timer of active.timers) clearTimeout(timer);
    this.active = null;
    active.resolve(result);
  }

  private onLine(line: string): void {
    for (const waiter of [...this.waiters]) waiter(line);
    const active = this.active;
    if (!active) return;
    const info = parseInfo(line);
    if (info) {
      active.lines.set(info.multipv, info);
      return;
    }
    const best = parseBestmove(line);
    if (best) {
      const lines = [...active.lines.values()].sort((a, b) => a.multipv - b.multipv);
      this.finish(
        active.cancelled
          ? { bestmove: null, lines, cancelled: true }
          : { bestmove: best.move, lines, cancelled: false },
      );
    }
  }

  private onEngineError(message: string): void {
    this.finish({ bestmove: null, lines: [], cancelled: true, error: message });
    this.starting = null;
  }
}
