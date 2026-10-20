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

// Stand-ins for the engine, the board view, the interface and the sound, for controller tests.

import type { MoveRecord } from '../../src/game/ChessGame.ts';
import type {
  BoardViewPort,
  MoveMarks,
  SoundEffect,
  SoundPort,
  UiPort,
} from '../../src/game/GameController.ts';
import type { BoardMap, Color, PromotionKind } from '../../src/game/types.ts';
import type {
  EngineInfo,
  EnginePort,
  SearchRequest,
  SearchResult,
} from '../../src/engine/StockfishAdapter.ts';

interface PendingSearch {
  readonly request: SearchRequest;
  resolve(result: SearchResult): void;
}

/** An engine whose answers the test gives by hand. */
export class FakeEngine implements EnginePort {
  readonly searches: PendingSearch[] = [];
  cancels = 0;
  newGames = 0;
  /** When set, searches are answered at once with this move. */
  autoReply: ((request: SearchRequest) => string | null) | null = null;

  async init(): Promise<EngineInfo> {
    return { name: 'Fake', options: new Map() };
  }

  async newGame(): Promise<void> {
    this.newGames++;
  }

  search(request: SearchRequest): Promise<SearchResult> {
    if (this.autoReply) {
      return Promise.resolve({ bestmove: this.autoReply(request), lines: [], cancelled: false });
    }
    return new Promise((resolve) => this.searches.push({ request, resolve }));
  }

  /** Answers the oldest open search. */
  reply(bestmove: string | null, lines: SearchResult['lines'] = []): SearchRequest {
    const next = this.searches.shift();
    if (!next) throw new Error('no search is waiting');
    next.resolve({ bestmove, lines, cancelled: false });
    return next.request;
  }

  async cancel(): Promise<void> {
    this.cancels++;
    for (const pending of this.searches.splice(0)) {
      pending.resolve({ bestmove: null, lines: [], cancelled: true });
    }
  }

  dispose(): void {}
}

/** Records what the controller asks of the board; animations can be held open. */
export class FakeView implements BoardViewPort {
  synced: BoardMap[] = [];
  played: MoveRecord[] = [];
  marks: MoveMarks = {};
  interactive: Color | null = null;
  finished = 0;
  holdAnimations = false;
  private held: Array<() => void> = [];

  sync(board: BoardMap): void {
    this.synced.push(board);
  }

  playMove(move: MoveRecord): Promise<void> {
    this.played.push(move);
    if (!this.holdAnimations) return Promise.resolve();
    return new Promise((resolve) => this.held.push(resolve));
  }

  releaseAnimations(): void {
    for (const resolve of this.held.splice(0)) resolve();
  }

  finishAnimations(): void {
    this.finished++;
    this.releaseAnimations();
  }

  setMarks(marks: MoveMarks): void {
    this.marks = marks;
  }

  setInteractive(side: Color | null): void {
    this.interactive = side;
  }
}

export class FakeUi implements UiPort {
  answer: PromotionKind | null = 'q';
  asked: Color[] = [];

  async askPromotion(color: Color): Promise<PromotionKind | null> {
    this.asked.push(color);
    return this.answer;
  }
}

export class FakeSound implements SoundPort {
  played: SoundEffect[] = [];

  play(effect: SoundEffect): void {
    this.played.push(effect);
  }
}

/** Lets pending promise callbacks run. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
