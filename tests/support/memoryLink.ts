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

// Two ends of a connection in memory, for session tests: messages cross asynchronously, as JSON
// would. sendRaw lets a test speak as a modified client and send anything at all.

import type { LinkHandlers, LinkPort } from '../../src/net/LinkPort.ts';
import type { Message } from '../../src/net/protocol.ts';

const NONE: LinkHandlers = {
  message: () => undefined,
  join: () => undefined,
  leave: () => undefined,
  error: () => undefined,
};

export class MemoryLink implements LinkPort {
  other: MemoryLink | null = null;
  handlers: LinkHandlers = NONE;
  connected = false;
  closed = false;
  kicked = false;
  rtt = 40;
  /** Everything this end sent, in order. */
  readonly sent: unknown[] = [];

  setHandlers(handlers: LinkHandlers): void {
    this.handlers = handlers;
  }

  async send(message: Message): Promise<void> {
    this.sendRaw(JSON.parse(JSON.stringify(message)));
  }

  /** Sends any data, unchecked, as a modified client could. */
  sendRaw(data: unknown): void {
    if (!this.connected || this.closed || !this.other) return;
    this.sent.push(data);
    const peer = this.other;
    // Once sent, a message arrives even if the sender closes straight after.
    void Promise.resolve().then(() => {
      if (!peer.closed) peer.handlers.message(data);
    });
  }

  ping(): Promise<number> {
    return this.connected ? Promise.resolve(this.rtt) : Promise.reject(new Error('not connected'));
  }

  kick(): void {
    this.kicked = true;
    if (this.other) unplug(this, this.other);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.other) unplug(this, this.other);
  }
}

/** Connects two ends: each hears that the other joined. */
export function plug(a: MemoryLink, b: MemoryLink): void {
  a.other = b;
  b.other = a;
  a.connected = true;
  b.connected = true;
  void Promise.resolve().then(() => {
    a.handlers.join();
    b.handlers.join();
  });
}

/** Drops the connection: each end that was connected hears that the other left. */
export function unplug(a: MemoryLink, b: MemoryLink): void {
  for (const [end, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!end.connected || end.other !== other) continue;
    end.connected = false;
    end.other = null;
    if (!end.closed) void Promise.resolve().then(() => end.handlers.leave());
  }
}

/** Lets every pending message and handler run. */
export async function settle(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
