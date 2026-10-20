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

// The Chess Coach's board aids and commentary, computed from the position: squares where captures
// or checks are possible, danger and safe zones, board coverage, isolated and passed pawns, and a
// sentence about each move.

import { SQUARES, squareIndices, type Square } from '../scene/coords.ts';
import type { ChessGame, GameStatus, MoveRecord } from './ChessGame.ts';
import { COLOR_NAMES, PIECE_NAMES, opposite, type BoardMap, type Color } from './types.ts';

export type BoardAid = 'off' | 'danger' | 'safe' | 'coverage';
export type PawnAid = 'off' | 'isolated' | 'passed';

export interface CoachOptions {
  readonly captureMoves: boolean;
  readonly checkMoves: boolean;
  readonly board: BoardAid;
  readonly pawns: PawnAid;
  /** Whose point of view the aids take. */
  readonly side: Color;
}

export interface CoachMarks {
  /** Destination squares worth pointing out (captures, checks). */
  readonly spots: Square[];
  /** Tinted squares and their colour. */
  readonly zones: Square[];
  readonly zoneColour: string;
  /** Pawns to circle. */
  readonly pawns: Square[];
}

export const NO_COACH_MARKS: CoachMarks = { spots: [], zones: [], zoneColour: '', pawns: [] };

export function coachMarks(game: ChessGame, options: CoachOptions): CoachMarks {
  const side = options.side;
  const spots = new Set<Square>();
  if (game.turn() === side && (options.captureMoves || options.checkMoves)) {
    for (const move of game.legalMoves()) {
      if (options.captureMoves && move.capture) spots.add(move.to);
      if (options.checkMoves && /[+#]$/.test(move.san)) spots.add(move.to);
    }
  }
  let zones: Square[] = [];
  let zoneColour = '';
  if (options.board === 'danger') {
    // Your pieces standing on squares the opponent attacks.
    const board = game.board();
    zones = SQUARES.filter(
      (sq) => board[sq]?.color === side && game.isAttacked(sq, opposite(side)),
    );
    zoneColour = 'rgba(220,40,30,0.42)';
  } else if (options.board === 'safe') {
    zones = SQUARES.filter(
      (sq) => !game.isAttacked(sq, opposite(side)) && game.get(sq)?.color !== opposite(side),
    );
    zoneColour = 'rgba(60,200,90,0.32)';
  } else if (options.board === 'coverage') {
    zones = SQUARES.filter((sq) => game.isAttacked(sq, side));
    zoneColour = 'rgba(60,140,230,0.36)';
  }
  const board = game.board();
  const pawns =
    options.pawns === 'isolated'
      ? isolatedPawns(board, side)
      : options.pawns === 'passed'
        ? passedPawns(board, side)
        : [];
  return { spots: [...spots], zones, zoneColour, pawns };
}

function pawnsOf(board: BoardMap, color: Color): Square[] {
  return SQUARES.filter((sq) => board[sq]?.color === color && board[sq]?.kind === 'p');
}

/** Pawns with no friendly pawn on either neighbouring file. */
export function isolatedPawns(board: BoardMap, color: Color): Square[] {
  const pawns = pawnsOf(board, color);
  const files = new Set(pawns.map((sq) => squareIndices(sq).file));
  return pawns.filter((sq) => {
    const f = squareIndices(sq).file;
    return !files.has(f - 1) && !files.has(f + 1);
  });
}

/** Pawns with no enemy pawn ahead of them on their own or a neighbouring file. */
export function passedPawns(board: BoardMap, color: Color): Square[] {
  const enemy = pawnsOf(board, opposite(color)).map(squareIndices);
  return pawnsOf(board, color).filter((sq) => {
    const { file, rank } = squareIndices(sq);
    return !enemy.some(
      (e) => Math.abs(e.file - file) <= 1 && (color === 'w' ? e.rank > rank : e.rank < rank),
    );
  });
}

/** One line of commentary for a move just played. */
export function describeMove(move: MoveRecord, mover: string, inCheck: boolean): string {
  const name = PIECE_NAMES[move.piece];
  let text: string;
  if (move.kingsideCastle) text = `${mover} castled kingside.`;
  else if (move.queensideCastle) text = `${mover} castled queenside.`;
  else if (move.captured) {
    text = `${mover} captured a ${PIECE_NAMES[move.captured]} on ${move.to} with the ${name}.`;
  } else {
    text = `${mover} played ${move.san}.`;
  }
  if (move.promotion) text += ` The pawn becomes a ${PIECE_NAMES[move.promotion]}.`;
  if (inCheck && !move.san.endsWith('#')) text += ' Check!';
  return text;
}

export function describeResult(status: GameStatus): string {
  switch (status.kind) {
    case 'playing':
      return '';
    case 'checkmate':
      return `${capital(COLOR_NAMES[opposite(status.winner)])} is checkmated. ${capital(COLOR_NAMES[status.winner])} wins.`;
    case 'resigned':
      return `${capital(COLOR_NAMES[opposite(status.winner)])} resigns. ${capital(COLOR_NAMES[status.winner])} wins.`;
    case 'timeout':
      return `${capital(COLOR_NAMES[opposite(status.winner)])} ran out of time. ${capital(COLOR_NAMES[status.winner])} wins.`;
    case 'forfeit': {
      const loser = capital(COLOR_NAMES[opposite(status.winner)]);
      const why: Record<string, string> = {
        'invalid-move': `${loser}'s app sent an invalid move`,
        'invalid-data': `${loser}'s app sent invalid game data`,
        abandoned: `${loser} left the game`,
      };
      return `${why[status.reason] ?? `${loser} forfeits`}. ${capital(COLOR_NAMES[status.winner])} wins.`;
    }
    case 'draw': {
      const reasons: Record<string, string> = {
        stalemate: 'Stalemate.',
        'fifty-moves': 'Fifty moves without a capture or pawn move.',
        threefold: 'The same position appeared three times.',
        insufficient: 'Neither side has enough material to checkmate.',
        timeout: 'Time ran out, but the other side cannot checkmate.',
        agreement: 'Draw agreed.',
      };
      return `Draw. ${reasons[status.reason] ?? ''}`.trim();
    }
  }
}

function capital(text: string): string {
  return text[0]!.toUpperCase() + text.slice(1);
}
