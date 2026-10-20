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

// Plays each difficulty level against the next one up, with the real lite Stockfish and the same
// move policy the game uses, to check that every level is stronger than the one below it.
// Run: npm run ladder -- [games per pair = 6] [think-time scale = 0.5] [lower ids, e.g. easy]
// Games are adjudicated when one side is clearly winning (600 centipawns for six plies in a row)
// or after 160 plies.

import { createRng } from '../src/core/rng.ts';
import { DIFFICULTIES, type DifficultyPreset } from '../src/engine/difficulty.ts';
import { pickMove } from '../src/engine/movePolicy.ts';
import { StockfishAdapter } from '../src/engine/StockfishAdapter.ts';
import { lineScore } from '../src/engine/uci.ts';
import { ChessGame } from '../src/game/ChessGame.ts';
import { NodeProcessTransport, engineScript } from '../tests/support/NodeProcessTransport.ts';

const gamesPerPair = Number(process.argv[2] ?? 6);
const scale = Number(process.argv[3] ?? 0.5);
/** Optional comma-separated ids of the lower level of each pair to play, e.g. "beginner,easy". */
const only = process.argv[4]?.split(',');
const script = engineScript();
if (!script) throw new Error('stockfish is not installed');

type Result = 1 | 0.5 | 0;

async function playGame(
  white: DifficultyPreset,
  black: DifficultyPreset,
  seed: number,
): Promise<Result> {
  const engines = {
    w: new StockfishAdapter(() => new NodeProcessTransport(script!)),
    b: new StockfishAdapter(() => new NodeProcessTransport(script!)),
  };
  const presets = { w: white, b: black };
  const rng = createRng(seed);
  const game = new ChessGame();
  let streak = 0;
  let leader: 'w' | 'b' | null = null;
  try {
    await Promise.all([engines.w.init(), engines.b.init()]);
    for (let ply = 0; ply < 160 && !game.isOver(); ply++) {
      const side = game.turn();
      const preset = presets[side];
      const go = {
        ...preset.go,
        ...(preset.go.movetime
          ? { movetime: Math.max(30, Math.round(preset.go.movetime * scale)) }
          : {}),
      };
      const result = await engines[side].search({
        position: game.uciPosition(),
        options: preset.options,
        go,
      });
      const legal = new Set(game.legalMoves().map((m) => m.lan));
      let move = result.bestmove;
      if (preset.policy && result.lines.length > 1)
        move = pickMove(result.lines, preset.policy, rng, legal) ?? move;
      if (!move || !game.tryUci(move)) break;
      // Adjudicate using the stronger side's own evaluation.
      const best = result.lines[0];
      if (best && !preset.policy) {
        const score = lineScore(best);
        const winner = score > 600 ? side : score < -600 ? (side === 'w' ? 'b' : 'w') : null;
        streak = winner && winner === leader ? streak + 1 : winner ? 1 : 0;
        leader = winner;
        if (streak >= 6 && leader) return leader === 'w' ? 1 : 0;
      }
    }
    const status = game.status();
    if (status.kind === 'checkmate') return status.winner === 'w' ? 1 : 0;
    return 0.5;
  } finally {
    engines.w.dispose();
    engines.b.dispose();
  }
}

const lines: string[] = [];
for (let i = 0; i + 1 < DIFFICULTIES.length; i++) {
  const lower = DIFFICULTIES[i]!;
  const upper = DIFFICULTIES[i + 1]!;
  if (only && !only.includes(lower.id)) continue;
  let upperScore = 0;
  for (let g = 0; g < gamesPerPair; g++) {
    const upperIsWhite = g % 2 === 0;
    const result = upperIsWhite
      ? await playGame(upper, lower, g + i * 100)
      : await playGame(lower, upper, g + i * 100);
    upperScore += upperIsWhite ? result : 1 - result;
  }
  const line = `${upper.label.padEnd(17)} vs ${lower.label.padEnd(9)}: ${upperScore}/${gamesPerPair} for ${upper.label}`;
  lines.push(line);
  console.log(line);
}
console.log('\nScale', scale, '— every level should score more than half against the one below.');
