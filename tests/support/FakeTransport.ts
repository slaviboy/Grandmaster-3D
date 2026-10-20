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

// A scripted stand-in for an engine: tests decide what it answers and when.

import type { EngineTransport } from '../../src/engine/EngineTransport.ts';

export class FakeTransport implements EngineTransport {
  readonly sent: string[] = [];
  private readonly lineListeners = new Set<(line: string) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();
  terminated = false;
  /** Called for every command; may emit replies. */
  respond: (command: string, fake: FakeTransport) => void = (command, fake) => {
    if (command === 'uci') {
      fake.emit('id name Fake Engine');
      fake.emit('option name Skill Level type spin default 20 min 0 max 20');
      fake.emit('option name MultiPV type spin default 1 min 1 max 256');
      fake.emit('option name UCI_LimitStrength type check default false');
      fake.emit('option name UCI_Elo type spin default 1320 min 1320 max 3190');
      fake.emit('uciok');
    } else if (command === 'isready') {
      fake.emit('readyok');
    }
  };

  send(command: string): void {
    this.sent.push(command);
    queueMicrotask(() => this.respond(command, this));
  }

  emit(line: string): void {
    for (const listener of this.lineListeners) listener(line);
  }

  fail(message: string): void {
    for (const listener of this.errorListeners) listener(message);
  }

  onLine(listener: (line: string) => void): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }
}
