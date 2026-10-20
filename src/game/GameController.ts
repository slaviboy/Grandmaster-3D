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

// Runs a game: takes the player's moves, asks the engine for its replies, and keeps the board view,
// the clocks and the interface in step. It is plain TypeScript behind small interfaces (ports), so
// it can be tested without WebGL or a real engine.
//
// Every change of position bumps a generation number. Anything asynchronous (an engine search, an
// animation, the computer's thinking pause) checks the generation when it finishes and drops its
// result if the game has moved on, so a late engine reply can never land on the wrong position.

import { createRng, type Rng } from '../core/rng.ts';
import { Store } from '../core/Store.ts';
import { difficulty, type DifficultyId, type DifficultyPreset } from '../engine/difficulty.ts';
import { pickMove } from '../engine/movePolicy.ts';
import type { EnginePort, SearchResult } from '../engine/StockfishAdapter.ts';
import { lineScore } from '../engine/uci.ts';
import type { Square } from '../scene/coords.ts';
import {
  ChessGame,
  parseUci,
  type GameStatus,
  type LoadResult,
  type MoveInput,
  type MoveRecord,
} from './ChessGame.ts';
import { Clock } from './Clock.ts';
import type { GameMode, Settings } from './Settings.ts';
import {
  opposite,
  type BoardMap,
  type Color,
  type PieceKind,
  type PromotionKind,
} from './types.ts';

export type Phase =
  'loading' | 'playerTurn' | 'awaitingPromotion' | 'animating' | 'engineThinking' | 'gameOver';

export interface MoveMarks {
  readonly lastMove?: { readonly from: Square; readonly to: Square };
  readonly check?: Square;
  readonly hint?: { readonly from: Square; readonly to: Square };
}

/** What the controller needs from the 3D board. */
export interface BoardViewPort {
  /** Shows a position immediately (new game, undo, loading). */
  sync(board: BoardMap): void;
  /** Animates a move that the rules already accepted. */
  playMove(move: MoveRecord): Promise<void>;
  /** Ends running animations at their final state. */
  finishAnimations(): void;
  setMarks(marks: MoveMarks): void;
  /** Which side's pieces the player may pick up, or null for none. */
  setInteractive(side: Color | null): void;
}

export interface UiPort {
  /** Asks which piece a pawn promotes to; null if the player cancels. */
  askPromotion(color: Color): Promise<PromotionKind | null>;
}

export type SoundEffect =
  | 'move'
  | 'capture'
  | 'castle'
  | 'check'
  | 'promote'
  | 'illegal'
  | 'gameEnd'
  | 'shatter'
  | 'shatterGlass';

export interface SoundPort {
  play(effect: SoundEffect): void;
}

export interface EngineThought {
  readonly depth: number;
  readonly score: string;
}

export interface GameState {
  readonly phase: Phase;
  readonly mode: GameMode;
  readonly humanColor: Color;
  readonly turn: Color;
  readonly fen: string;
  readonly history: readonly MoveRecord[];
  readonly status: GameStatus;
  readonly inCheck: boolean;
  readonly captured: Record<Color, PieceKind[]>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly difficulty: DifficultyId;
  /** The computer's rating at the chosen difficulty (Custom has its own). */
  readonly rating: number;
  readonly minutes: number;
  readonly thinking: EngineThought | null;
  readonly hint: { readonly from: Square; readonly to: Square } | null;
  readonly engineError: string | null;
  /** Bumps on every change of position, for views that cache per position. */
  readonly generation: number;
}

export interface ControllerOptions {
  readonly engine: EnginePort | null;
  readonly view: BoardViewPort;
  readonly ui: UiPort;
  readonly sound: SoundPort;
  readonly settings: Settings;
  readonly seed?: number;
  readonly now?: () => number;
  /** Waits; injectable so tests need not sleep. */
  readonly delay?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GameController {
  readonly game = new ChessGame();
  readonly clock: Clock;
  readonly state: Store<GameState>;
  private settings: Settings;
  private phase: Phase = 'loading';
  private generation = 0;
  private hint: GameState['hint'] = null;
  private thinking: EngineThought | null = null;
  private engineError: string | null = null;
  private readonly rng: Rng;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly offFlag: () => void;
  /** Who made each move in the history, for the development consistency check. */
  private sources: Array<'player' | 'engine'> = [];
  /** Resolves when the current asynchronous step (animation, engine turn) is over. */
  private idle: Promise<void> = Promise.resolve();

  constructor(private readonly options: ControllerOptions) {
    this.settings = options.settings;
    this.rng = createRng(options.seed ?? Date.now());
    this.delay = options.delay ?? defaultDelay;
    this.clock = new Clock(this.limit(), options.now);
    this.offFlag = this.clock.onFlag((color) => this.onFlag(color));
    this.state = new Store(this.snapshot());
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Resolves once nothing is animating or thinking (for tests and screenshots). */
  async whenIdle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = this.idle;
      await seen;
    } while (seen !== this.idle);
  }

  /** Starts a new game with the current settings, or a given FEN. */
  async newGame(fen?: string): Promise<LoadResult> {
    const result = this.game.reset(fen);
    if (!result.ok) return result;
    await this.interrupt();
    this.sources = [];
    this.clock.reset(this.limit());
    this.hint = null;
    this.engineError = null;
    this.options.view.sync(this.game.board());
    if (this.options.engine && this.settings.mode === 'computer') {
      await this.options.engine.newGame().catch((error: Error) => this.reportEngineError(error));
    }
    this.settle();
    return result;
  }

  /** Applies new settings; the side, mode and clock take effect from the next game. */
  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.publish();
  }

  setDifficulty(id: DifficultyId): void {
    this.settings = { ...this.settings, difficulty: id };
    this.publish();
  }

  /** Legal destinations for a piece the player may move, else nothing. */
  legalTargets(from: Square): Square[] {
    return this.canHumanMove() ? this.game.legalTargets(from) : [];
  }

  /** Whether the player may pick up the piece on `square` now. */
  canPick(square: Square): boolean {
    const piece = this.game.get(square);
    return !!piece && this.canHumanMove() && piece.color === this.game.turn();
  }

  /**
   * A move the player made on the board. Resolves true if it was played; false (with nothing
   * changed) if it was illegal or the promotion was cancelled, so the view can put the piece back.
   */
  async playerMove(input: MoveInput): Promise<boolean> {
    if (!this.canHumanMove()) return false;
    let move = input;
    if (!move.promotion && this.game.needsPromotion(move.from, move.to)) {
      this.setPhase('awaitingPromotion');
      const color = this.game.turn();
      const generation = this.generation;
      const choice = await this.options.ui.askPromotion(color);
      if (generation !== this.generation) return false;
      this.setPhase('playerTurn');
      if (!choice) return false;
      move = { ...move, promotion: choice };
    }
    if (!this.game.isLegal(move)) {
      this.options.sound.play('illegal');
      return false;
    }
    // A hint search may still be running; free the engine for the reply. If anything changed
    // while waiting, the move no longer applies.
    const generation = this.generation;
    await this.options.engine?.cancel();
    if (generation !== this.generation || !this.canHumanMove()) return false;
    this.hint = null;
    const record = this.game.tryMove(move);
    if (!record) return false;
    this.sources.push('player');
    this.track(this.afterMove(record));
    return true;
  }

  /** Takes back the last move (against the computer: the computer's reply and your move). */
  async undo(): Promise<void> {
    if (!this.game.canUndo() || this.phase === 'loading') return;
    const engineTurn = this.isEngineTurn();
    await this.interrupt();
    const plies = this.settings.mode === 'computer' && !engineTurn ? 2 : 1;
    for (let i = 0; i < plies && this.game.canUndo(); i++) {
      this.game.undo();
      this.sources.pop();
    }
    this.options.view.sync(this.game.board());
    this.settle();
  }

  /** Replays moves that were taken back. */
  async redo(): Promise<void> {
    if (!this.game.canRedo() || this.phase === 'loading') return;
    await this.interrupt();
    const plies = this.settings.mode === 'computer' ? 2 : 1;
    for (let i = 0; i < plies && this.game.canRedo(); i++) {
      const record = this.game.redo();
      if (record)
        this.sources.push(record.color === this.settings.humanColor ? 'player' : 'engine');
    }
    this.options.view.sync(this.game.board());
    this.settle();
  }

  /** The player gives up (in a two-player game, the side to move resigns). */
  async resign(): Promise<void> {
    if (this.game.isOver()) return;
    const loser = this.settings.mode === 'computer' ? this.settings.humanColor : this.game.turn();
    await this.interrupt();
    this.game.setResult({ kind: 'resigned', winner: opposite(loser) });
    this.settle();
  }

  async loadFen(fen: string): Promise<LoadResult> {
    return this.newGame(fen);
  }

  async loadPgn(pgn: string): Promise<LoadResult> {
    const copy = new ChessGame();
    const check = copy.loadPgn(pgn);
    if (!check.ok) return check;
    await this.interrupt();
    this.game.loadPgn(pgn);
    this.sources = this.game.history().map(() => 'player');
    this.clock.reset(this.limit());
    this.options.view.sync(this.game.board());
    this.settle();
    return check;
  }

  /** Asks the engine for a good move for the player and marks it on the board. */
  async requestHint(): Promise<GameState['hint']> {
    const engine = this.options.engine;
    if (!engine || !this.canHumanMove()) return null;
    const generation = this.generation;
    const result = await engine.search({
      position: this.game.uciPosition(),
      options: difficulty('hard').options,
      go: { movetime: 700 },
    });
    if (generation !== this.generation || result.cancelled || !result.bestmove) return null;
    const input = parseUci(result.bestmove);
    if (!input || !this.game.isLegal(input)) return null;
    this.hint = { from: input.from, to: input.to };
    this.pushMarks();
    this.publish();
    return this.hint;
  }

  /** Makes the computer move now with the best move it has found so far. */
  async moveNow(): Promise<void> {
    if (this.phase === 'engineThinking') await this.options.engine?.cancel();
  }

  dispose(): void {
    this.generation++;
    this.offFlag();
    this.clock.pause();
  }

  /** Each move with its side and whether the computer made it. */
  moveAudit(): Array<{ color: Color; byEngine: boolean }> {
    return this.game
      .history()
      .map((m, i) => ({ color: m.color, byEngine: this.sources[i] === 'engine' }));
  }

  /** Call every frame: advances the clocks and notices a falling flag. */
  tick(): void {
    this.clock.tick();
  }

  // --- internals -----------------------------------------------------------------------------

  private limit(): number | null {
    return this.settings.minutes > 0 ? this.settings.minutes * 60000 : null;
  }

  private canHumanMove(): boolean {
    if (this.phase !== 'playerTurn' || this.game.isOver()) return false;
    return this.settings.mode === 'local' || this.game.turn() === this.settings.humanColor;
  }

  private isEngineTurn(): boolean {
    return (
      this.settings.mode === 'computer' &&
      !!this.options.engine &&
      !this.game.isOver() &&
      this.game.turn() !== this.settings.humanColor
    );
  }

  /** Cancels whatever is in flight and finishes animations, leaving the board on the logical state. */
  private async interrupt(): Promise<void> {
    this.generation++;
    this.thinking = null;
    this.options.view.finishAnimations();
    await this.options.engine?.cancel();
  }

  private track(step: Promise<void>): void {
    this.idle = step.catch((error: unknown) => console.error(error));
  }

  private async afterMove(record: MoveRecord): Promise<void> {
    const generation = ++this.generation;
    this.setPhase('animating');
    this.options.view.setInteractive(null);
    this.clock.pause();
    this.pushMarks();
    await this.options.view.playMove(record);
    if (generation !== this.generation) return;
    this.options.sound.play(this.soundFor(record));
    this.settle();
  }

  private soundFor(record: MoveRecord): SoundEffect {
    if (this.game.inCheck()) return 'check';
    if (record.promotion) return 'promote';
    if (record.kingsideCastle || record.queensideCastle) return 'castle';
    return record.capture ? 'capture' : 'move';
  }

  /** Decides what happens next from the current position. */
  private settle(): void {
    this.pushMarks();
    if (this.game.isOver()) {
      this.clock.pause();
      this.setPhase('gameOver');
      this.options.view.setInteractive(null);
      this.options.sound.play('gameEnd');
      return;
    }
    if (this.game.history().length > 0 || this.game.turn() !== this.settings.humanColor) {
      this.clock.start(this.game.turn());
    }
    if (this.isEngineTurn()) {
      this.track(this.engineTurn());
      return;
    }
    this.setPhase('playerTurn');
    this.options.view.setInteractive(this.game.turn());
  }

  private async engineTurn(): Promise<void> {
    const engine = this.options.engine!;
    const generation = this.generation;
    const fen = this.game.fen();
    const preset = difficulty(this.settings.difficulty, this.settings.customRating);
    this.thinking = { depth: 0, score: '' };
    this.options.view.setInteractive(null);
    this.setPhase('engineThinking');
    const started = performance.now();

    let result: SearchResult;
    try {
      result = await engine.search({
        position: this.game.uciPosition(),
        options: preset.options,
        go: this.goLimits(preset),
      });
    } catch (error) {
      this.reportEngineError(error as Error);
      result = { bestmove: null, lines: [], cancelled: false, error: (error as Error).message };
    }
    if (generation !== this.generation || this.game.fen() !== fen) return;
    if (result.error) this.engineError = result.error;
    const best = result.lines[0];
    this.thinking = best
      ? { depth: best.depth, score: formatScore(lineScore(best), this.game.turn()) }
      : null;

    const wait = preset.minThinkMs - (performance.now() - started);
    if (wait > 0) await this.delay(wait);
    if (generation !== this.generation) return;

    const uci = this.chooseMove(result, preset);
    const record = uci ? this.game.tryUci(uci) : null;
    this.thinking = null;
    if (!record) {
      // The engine gave nothing usable although moves exist (a crash or a timeout): play the first
      // legal move rather than freeze the game.
      const fallback = this.game.legalMoves()[0];
      if (!fallback) return this.settle();
      console.warn('engine gave no usable move; playing', fallback.san);
      const forced = this.game.tryMove({
        from: fallback.from,
        to: fallback.to,
        promotion: fallback.promotion as PromotionKind | undefined,
      });
      if (forced) {
        this.sources.push('engine');
        await this.afterMove(forced);
      }
      return;
    }
    this.sources.push('engine');
    await this.afterMove(record);
  }

  private chooseMove(result: SearchResult, preset: DifficultyPreset): string | null {
    const legal = new Set(this.game.legalMoves().map((m) => m.lan));
    if (result.cancelled) {
      // "Move now" stopped the search early: play the best line found so far.
      const early = result.lines[0]?.pv[0];
      return early && legal.has(early) ? early : null;
    }
    if (preset.policy && result.lines.length > 1) {
      const picked = pickMove(result.lines, preset.policy, this.rng, legal);
      if (picked) return picked;
    }
    return result.bestmove && legal.has(result.bestmove) ? result.bestmove : null;
  }

  private goLimits(preset: DifficultyPreset): DifficultyPreset['go'] {
    const remaining = this.clock.remaining(this.game.turn());
    if (!Number.isFinite(remaining) || preset.go.movetime === undefined) return preset.go;
    // Never spend more than a twentieth of the time left on one move.
    return {
      ...preset.go,
      movetime: Math.max(50, Math.min(preset.go.movetime, Math.floor(remaining / 20))),
    };
  }

  private async onFlag(color: Color): Promise<void> {
    if (this.game.isOver()) return;
    await this.interrupt();
    this.game.timeout(color);
    this.settle();
  }

  private reportEngineError(error: Error): void {
    this.engineError = error.message;
    console.error('engine:', error.message);
    this.publish();
  }

  private pushMarks(): void {
    const last = this.game.lastMove();
    const turn = this.game.turn();
    this.options.view.setMarks({
      lastMove: last ? { from: last.from, to: last.to } : undefined,
      check: this.game.inCheck() ? this.game.kingSquare(turn) : undefined,
      hint: this.hint ?? undefined,
    });
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.publish();
  }

  private snapshot(): GameState {
    return {
      phase: this.phase,
      mode: this.settings.mode,
      humanColor: this.settings.humanColor,
      turn: this.game.turn(),
      fen: this.game.fen(),
      history: [...this.game.history()],
      status: this.game.status(),
      inCheck: this.game.inCheck(),
      captured: this.game.captured(),
      canUndo: this.game.canUndo() && this.phase !== 'loading',
      canRedo: this.game.canRedo() && this.phase !== 'loading',
      difficulty: this.settings.difficulty,
      rating: difficulty(this.settings.difficulty, this.settings.customRating).rating,
      minutes: this.settings.minutes,
      thinking: this.thinking,
      hint: this.hint,
      engineError: this.engineError,
      generation: this.generation,
    };
  }

  private publish(): void {
    this.state?.set(this.snapshot());
  }
}

/** "+0.35", "-1.20" or "#3" from White's point of view. */
function formatScore(score: number, sideToMove: Color): string {
  const white = sideToMove === 'w' ? score : -score;
  if (Math.abs(white) >= 50000) {
    const moves = Math.max(1, Math.round((100000 - Math.abs(white)) / 100));
    return `${white > 0 ? '' : '-'}#${moves}`;
  }
  return `${white >= 0 ? '+' : ''}${(white / 100).toFixed(2)}`;
}
