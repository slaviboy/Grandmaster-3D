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

// How the adapter talks to an engine: text commands in, text lines out. The browser uses a Web
// Worker; tests use a Node child process running the same engine build.

export interface EngineTransport {
  send(command: string): void;
  /** Subscribes to output lines; returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void;
  /** Called with a message if the engine crashes or fails to load. */
  onError(listener: (message: string) => void): () => void;
  terminate(): void;
}

/** Runs the engine in a Web Worker loaded from public/engine/. */
export class WorkerTransport implements EngineTransport {
  private readonly worker: Worker;
  private readonly lineListeners = new Set<(line: string) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();

  constructor(url: string) {
    this.worker = new Worker(url);
    this.worker.onmessage = (event: MessageEvent) => {
      const text = typeof event.data === 'string' ? event.data : String(event.data);
      for (const line of text.split('\n')) {
        if (line) for (const listener of this.lineListeners) listener(line);
      }
    };
    this.worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      for (const listener of this.errorListeners) listener(event.message || 'engine worker failed');
    };
  }

  send(command: string): void {
    this.worker.postMessage(command);
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
    this.worker.terminate();
    this.lineListeners.clear();
    this.errorListeners.clear();
  }
}
