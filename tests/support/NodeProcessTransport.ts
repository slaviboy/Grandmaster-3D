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

// Runs the same lite Stockfish build the browser uses, as a Node child process, for tests.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { EngineTransport } from '../../src/engine/EngineTransport.ts';

export function engineScript(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const file = join(
      dirname(require.resolve('stockfish/package.json')),
      'bin',
      'stockfish-19-lite-single.js',
    );
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export class NodeProcessTransport implements EngineTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lineListeners = new Set<(line: string) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();
  private buffer = '';
  sent: string[] = [];

  constructor(script: string) {
    this.child = spawn(process.execPath, [script], { stdio: 'pipe' });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let index: number;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (line) for (const listener of this.lineListeners) listener(line);
      }
    });
    this.child.on('error', (error) => {
      for (const listener of this.errorListeners) listener(error.message);
    });
  }

  send(command: string): void {
    this.sent.push(command);
    this.child.stdin.write(command + '\n');
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
    this.child.kill();
    this.lineListeners.clear();
  }
}
