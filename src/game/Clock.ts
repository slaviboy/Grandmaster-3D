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

// A chess clock for two players. With a limit, each side's time counts down and a flag falls at
// zero; untimed, it simply measures how long each side has thought.

import type { Color } from './types.ts';

export class Clock {
  private used: Record<Color, number> = { w: 0, b: 0 };
  private running: Color | null = null;
  private since = 0;
  private flagged = false;
  /** Extra time before a side's flag falls; online, it covers the network delay. */
  private grace: Record<Color, number> = { w: 0, b: 0 };
  private readonly flagListeners = new Set<(color: Color) => void>();

  constructor(
    private limitMs: number | null,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get limit(): number | null {
    return this.limitMs;
  }

  get active(): Color | null {
    return this.running;
  }

  reset(limitMs: number | null): void {
    this.limitMs = limitMs;
    this.used = { w: 0, b: 0 };
    this.running = null;
    this.flagged = false;
    this.grace = { w: 0, b: 0 };
  }

  /** Starts (or switches) the clock for the given side. */
  start(color: Color): void {
    this.pause();
    this.running = color;
    this.since = this.now();
  }

  /** Stops the running clock, keeping the time used so far. */
  pause(): void {
    if (this.running) this.used[this.running] += this.now() - this.since;
    this.running = null;
  }

  /** Milliseconds used by a side, including the current turn. */
  elapsed(color: Color): number {
    return this.used[color] + (this.running === color ? this.now() - this.since : 0);
  }

  /** Milliseconds left for a side; Infinity when untimed. */
  remaining(color: Color): number {
    return this.limitMs === null ? Infinity : Math.max(0, this.limitMs - this.elapsed(color));
  }

  /** Each side's time used so far, for saving or sending. */
  usedTimes(): Record<Color, number> {
    return { w: this.elapsed('w'), b: this.elapsed('b') };
  }

  /** Sets the time each side has used, as when an interrupted game is restored. */
  restore(used: Record<Color, number>): void {
    const running = this.running;
    this.pause();
    this.used = { w: Math.max(0, used.w), b: Math.max(0, used.b) };
    if (running) this.start(running);
  }

  /** Gives a side back time it was charged, never more than it has used. */
  refund(color: Color, ms: number): void {
    this.used[color] -= Math.min(Math.max(0, ms), this.elapsed(color));
  }

  /** Lets a side's flag fall only this many milliseconds after its time reaches zero. */
  setGrace(color: Color, ms: number): void {
    this.grace[color] = Math.max(0, ms);
  }

  onFlag(listener: (color: Color) => void): () => void {
    this.flagListeners.add(listener);
    return () => this.flagListeners.delete(listener);
  }

  /** Call regularly (each animation frame or timer tick) to detect a falling flag. */
  tick(): void {
    const color = this.running;
    if (!color || this.flagged || this.limitMs === null) return;
    if (this.limitMs - this.elapsed(color) + this.grace[color] <= 0) {
      this.flagged = true;
      this.pause();
      for (const listener of this.flagListeners) listener(color);
    }
  }
}

/** "09:27", or "1:02:03" past an hour. */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
