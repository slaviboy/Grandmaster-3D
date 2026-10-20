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

// The rules of the game. This is the only module that talks to chess.js, and chess.js is the
// authority: nothing reaches the board unless chess.js accepted it. On top of it this class keeps
// a redo stack, a cached move history, results chess.js does not know (resignation, time), and
// safe FEN/PGN loading that leaves the current game untouched when the input is bad.

import { Chess, DEFAULT_POSITION, validateFen, type Move } from 'chess.js';
import { isSquare, type Square } from '../scene/coords.ts';
import {
  opposite,
  type BoardMap,
  type Color,
  type Piece,
  type PieceKind,
  type PromotionKind,
} from './types.ts';

export interface MoveInput {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionKind;
}

export interface MoveRecord {
  readonly color: Color;
  readonly from: Square;
  readonly to: Square;
  readonly piece: PieceKind;
  readonly captured?: PieceKind;
  readonly promotion?: PieceKind;
  readonly san: string;
  /** Long algebraic / UCI form, e.g. "e7e8q". */
  readonly lan: string;
  readonly capture: boolean;
  readonly enPassant: boolean;
  readonly kingsideCastle: boolean;
  readonly queensideCastle: boolean;
  readonly before: string;
  readonly after: string;
}

export type DrawReason =
  'stalemate' | 'fifty-moves' | 'threefold' | 'insufficient' | 'timeout' | 'agreement';

export type GameStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'resigned'; readonly winner: Color }
  | { readonly kind: 'timeout'; readonly winner: Color }
  | { readonly kind: 'draw'; readonly reason: DrawReason };

export type LoadResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export const START_FEN = DEFAULT_POSITION;

function toRecord(move: Move): MoveRecord {
  return {
    color: move.color,
    from: move.from as Square,
    to: move.to as Square,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
    san: move.san,
    lan: move.lan,
    capture: move.isCapture(),
    enPassant: move.isEnPassant(),
    kingsideCastle: move.isKingsideCastle(),
    queensideCastle: move.isQueensideCastle(),
    before: move.before,
    after: move.after,
  };
}

export class ChessGame {
  private chess: Chess;
  private start: string;
  private moves: MoveRecord[] = [];
  private redoStack: MoveInput[] = [];
  private result: GameStatus | null = null;

  constructor(fen: string = START_FEN) {
    this.chess = new Chess(fen);
    this.start = this.chess.fen();
  }

  get startFen(): string {
    return this.start;
  }

  fen(): string {
    return this.chess.fen();
  }

  turn(): Color {
    return this.chess.turn();
  }

  get(square: Square): Piece | undefined {
    const piece = this.chess.get(square);
    return piece ? { color: piece.color, kind: piece.type } : undefined;
  }

  board(): BoardMap {
    const map: BoardMap = {};
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) map[cell.square as Square] = { color: cell.color, kind: cell.type };
      }
    }
    return map;
  }

  inCheck(): boolean {
    return this.chess.isCheck();
  }

  /** Whether `by` attacks `square` in the current position. */
  isAttacked(square: Square, by: Color): boolean {
    return this.chess.isAttacked(square, by);
  }

  kingSquare(color: Color): Square | undefined {
    const [square] = this.chess.findPiece({ type: 'k', color });
    return square as Square | undefined;
  }

  /** Legal moves, optionally only from one square. Empty once the game is over. */
  legalMoves(from?: Square): MoveRecord[] {
    if (this.result) return [];
    const moves = from
      ? this.chess.moves({ square: from, verbose: true })
      : this.chess.moves({ verbose: true });
    return moves.map(toRecord);
  }

  legalTargets(from: Square): Square[] {
    return [...new Set(this.legalMoves(from).map((m) => m.to))];
  }

  isLegal(input: MoveInput): boolean {
    return this.legalMoves(input.from).some(
      (m) => m.to === input.to && (m.promotion ? m.promotion === input.promotion : true),
    );
  }

  /** True when moving from -> to is legal only as a promotion, so a piece must be chosen. */
  needsPromotion(from: Square, to: Square): boolean {
    return this.legalMoves(from).some((m) => m.to === to && m.promotion !== undefined);
  }

  /**
   * Plays a move if it is legal and returns it; returns null (and changes nothing) otherwise. A
   * promotion move without a chosen piece is rejected rather than guessed.
   */
  tryMove(input: MoveInput | string): MoveRecord | null {
    const record = this.apply(input);
    if (record) this.redoStack = [];
    return record;
  }

  /** Accepts a UCI move such as "e2e4" or "e7e8q". */
  tryUci(uci: string): MoveRecord | null {
    const input = parseUci(uci);
    return input ? this.tryMove(input) : null;
  }

  private apply(input: MoveInput | string): MoveRecord | null {
    if (this.result) return null;
    if (typeof input !== 'string' && !isSquare(input.from)) return null;
    try {
      const move = this.chess.move(
        typeof input === 'string'
          ? input
          : {
              from: input.from,
              to: input.to,
              ...(input.promotion ? { promotion: input.promotion } : {}),
            },
      );
      const record = toRecord(move);
      this.moves.push(record);
      return record;
    } catch {
      return null;
    }
  }

  canUndo(): boolean {
    return this.moves.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Takes back the last move (and clears a resignation or time result). */
  undo(): MoveRecord | null {
    const last = this.moves.at(-1);
    if (!last) return null;
    this.chess.undo();
    this.moves.pop();
    this.result = null;
    this.redoStack.push({
      from: last.from,
      to: last.to,
      promotion: last.promotion as PromotionKind | undefined,
    });
    return last;
  }

  /** Replays the most recently undone move. */
  redo(): MoveRecord | null {
    const next = this.redoStack.at(-1);
    if (!next) return null;
    const record = this.apply(next);
    if (record) this.redoStack.pop();
    return record;
  }

  history(): readonly MoveRecord[] {
    return this.moves;
  }

  lastMove(): MoveRecord | undefined {
    return this.moves.at(-1);
  }

  /** Records a result chess.js cannot see: resignation, flag fall or an agreed draw. */
  setResult(result: GameStatus): void {
    this.result = result;
  }

  /** The side that ran out of time loses, unless the other side could never mate. */
  timeout(flagged: Color): GameStatus {
    const winner = opposite(flagged);
    const status: GameStatus = this.canMate(winner)
      ? { kind: 'timeout', winner }
      : { kind: 'draw', reason: 'timeout' };
    this.result = status;
    return status;
  }

  /** Whether `color` has enough material to mate in some legal sequence. */
  canMate(color: Color): boolean {
    const board = this.board();
    const own = Object.values(board).filter((p) => p.color === color && p.kind !== 'k');
    const theirs = Object.values(board).filter((p) => p.color !== color && p.kind !== 'k');
    if (own.some((p) => p.kind === 'p' || p.kind === 'r' || p.kind === 'q')) return true;
    if (own.length >= 2) return true;
    // A lone minor piece can only mate if the opponent has pieces to block their own king.
    return own.length === 1 && theirs.length > 0;
  }

  status(): GameStatus {
    if (this.result) return this.result;
    const c = this.chess;
    if (c.isCheckmate()) return { kind: 'checkmate', winner: opposite(c.turn()) };
    if (c.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient' };
    if (c.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold' };
    if (c.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty-moves' };
    return { kind: 'playing' };
  }

  isOver(): boolean {
    return this.status().kind !== 'playing';
  }

  /** Pieces each side has lost, in capture order: captured.w are White's lost pieces. */
  captured(): Record<Color, PieceKind[]> {
    const lost: Record<Color, PieceKind[]> = { w: [], b: [] };
    for (const move of this.moves) {
      if (move.captured) lost[opposite(move.color)].push(move.captured);
    }
    return lost;
  }

  /** The position as a UCI command, with the moves so the engine sees repetitions. */
  uciPosition(): string {
    const moves = this.moves.map((m) => m.lan).join(' ');
    const base = this.start === START_FEN ? 'position startpos' : `position fen ${this.start}`;
    return moves ? `${base} moves ${moves}` : base;
  }

  /** Starts over from the standard position or a given FEN. */
  reset(fen: string = START_FEN): LoadResult {
    const check = validateFen(fen);
    if (!check.ok) return { ok: false, error: check.error ?? 'invalid FEN' };
    this.chess = new Chess(fen);
    this.start = this.chess.fen();
    this.moves = [];
    this.redoStack = [];
    this.result = null;
    return { ok: true };
  }

  loadFen(fen: string): LoadResult {
    return this.reset(fen.trim());
  }

  /** Loads a PGN; on failure the current game is kept exactly as it was. */
  loadPgn(pgn: string): LoadResult {
    const next = new Chess();
    try {
      next.loadPgn(pgn.trim());
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    const played = next.history({ verbose: true });
    const startFen = played[0]?.before ?? next.fen();
    const replay = new Chess(startFen);
    const records: MoveRecord[] = [];
    for (const move of played) records.push(toRecord(replay.move(move.san)));
    for (const [key, value] of Object.entries(next.getHeaders())) {
      if (value !== null && value !== undefined) replay.setHeader(key, value);
    }
    this.chess = replay;
    this.start = startFen;
    this.moves = records;
    this.redoStack = [];
    this.result = null;
    return { ok: true };
  }

  toPgn(headers: Record<string, string> = {}): string {
    for (const [key, value] of Object.entries(headers)) this.chess.setHeader(key, value);
    const status = this.status();
    const result =
      status.kind === 'playing'
        ? '*'
        : status.kind === 'draw'
          ? '1/2-1/2'
          : status.winner === 'w'
            ? '1-0'
            : '0-1';
    this.chess.setHeader('Result', result);
    return this.chess.pgn();
  }
}

export function parseUci(uci: string): MoveInput | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci.trim());
  if (!match) return null;
  return {
    from: match[1] as Square,
    to: match[2] as Square,
    promotion: match[3] as PromotionKind | undefined,
  };
}
