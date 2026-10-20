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

import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng.ts';
import { checkConsistency } from '../../src/dev/ConsistencyChecker.ts';
import { ChessGame, type MoveRecord } from '../../src/game/ChessGame.ts';
import { pieceCode, type Color, type PieceKind } from '../../src/game/types.ts';
import { AnimationController } from '../../src/scene/AnimationController.ts';
import { Tweener } from '../../src/scene/animation/tween.ts';
import type { PieceAssetManager } from '../../src/scene/PieceAssetManager.ts';
import { PieceManager } from '../../src/scene/PieceManager.ts';
import type { Square } from '../../src/scene/coords.ts';

/** Stand-in for the GLB loader: boxes instead of Blender models. */
function fakeAssets(): PieceAssetManager {
  const geometry = new BoxGeometry(0.5, 1, 0.5);
  return {
    create: (color: Color, kind: PieceKind) => {
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.name = `${color}${kind}`;
      return mesh;
    },
    release: (mesh: Mesh) => (mesh.material as MeshBasicMaterial).dispose(),
    material: () => new MeshBasicMaterial(),
    height: () => 1,
  } as unknown as PieceAssetManager;
}

function sceneOf(pieces: PieceManager) {
  const snapshot = pieces.snapshot();
  const positions: Partial<Record<Square, { x: number; y: number; z: number }>> = {};
  for (const square of Object.keys(snapshot) as Square[]) {
    const p = pieces.get(square)!.mesh.position;
    positions[square] = { x: p.x, y: p.y, z: p.z };
  }
  return { pieces: snapshot, positions, meshCount: pieces.group.children.length };
}

describe('PieceManager', () => {
  it('sets up the 32 pieces of the starting position', () => {
    const pieces = new PieceManager(fakeAssets());
    const game = new ChessGame();
    pieces.sync(game.board());
    expect(pieces.group.children).toHaveLength(32);
    expect(pieces.snapshot().e1).toBe('wK');
    expect(pieces.snapshot().d8).toBe('bQ');
    expect(checkConsistency(game.board(), sceneOf(pieces))).toEqual([]);
  });

  it('restyles every piece in place without disturbing the position', () => {
    const pieces = new PieceManager(fakeAssets());
    const game = new ChessGame();
    pieces.sync(game.board());
    const king = pieces.get('e1')!.mesh;
    const before = king.material as MeshBasicMaterial;
    let disposed = false;
    before.addEventListener('dispose', () => (disposed = true));
    pieces.restyle();
    expect(pieces.get('e1')!.mesh).toBe(king);
    expect(king.material).not.toBe(before);
    expect(disposed).toBe(true);
    expect(checkConsistency(game.board(), sceneOf(pieces))).toEqual([]);
  });

  it('reuses meshes when re-syncing', () => {
    const pieces = new PieceManager(fakeAssets());
    const game = new ChessGame();
    pieces.sync(game.board());
    const knight = pieces.get('g1')!.mesh;
    game.tryMove('Nf3');
    pieces.sync(game.board());
    expect(pieces.get('f3')!.mesh).toBe(knight);
    expect(pieces.get('g1')).toBeUndefined();
  });

  it('stays in step with the rules over 200 random games, animated and re-synced', async () => {
    const rng = createRng(2026);
    for (let gameIndex = 0; gameIndex < 200; gameIndex++) {
      const assets = fakeAssets();
      const pieces = new PieceManager(assets);
      const tweener = new Tweener();
      tweener.speed = 0;
      const animations = new AnimationController(tweener, pieces, assets, () => ({
        followPath: gameIndex % 2 === 0,
        demolish: false,
      }));
      const game = new ChessGame();
      pieces.sync(game.board());
      for (let ply = 0; ply < 60; ply++) {
        const moves = game.legalMoves();
        if (moves.length === 0) break;
        const pick = moves[Math.floor(rng() * moves.length)]!;
        const move = game.tryMove({
          from: pick.from,
          to: pick.to,
          promotion: pick.promotion as 'q' | undefined,
        }) as MoveRecord;
        await animations.playMove(move);
        const errors = checkConsistency(game.board(), sceneOf(pieces));
        expect(errors, `game ${gameIndex}, ply ${ply}, ${move.san}`).toEqual([]);
        // Now and then take a move back the way the controller does: interrupt, undo, re-sync.
        if (rng() < 0.08) {
          animations.finishAll();
          game.undo();
          pieces.sync(game.board());
          expect(checkConsistency(game.board(), sceneOf(pieces))).toEqual([]);
        }
      }
    }
  });

  it('handles castling, en passant and promotion in the scene', async () => {
    const assets = fakeAssets();
    const pieces = new PieceManager(assets);
    const tweener = new Tweener();
    tweener.speed = 0;
    const animations = new AnimationController(tweener, pieces, assets, () => ({
      followPath: true,
      demolish: false,
    }));
    const play = async (game: ChessGame, san: string) => {
      const move = game.tryMove(san)!;
      await animations.playMove(move);
      expect(checkConsistency(game.board(), sceneOf(pieces))).toEqual([]);
    };
    const castle = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    pieces.sync(castle.board());
    await play(castle, 'O-O');
    expect(pieces.snapshot().f1).toBe('wR');
    await play(castle, 'O-O-O');
    expect(pieces.snapshot().d8).toBe('bR');

    const ep = new ChessGame('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    pieces.sync(ep.board());
    await play(ep, 'exd6');
    expect(pieces.snapshot().d5).toBeUndefined();

    const promote = new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    pieces.sync(promote.board());
    const move = promote.tryMove({ from: 'a7', to: 'a8', promotion: 'n' })!;
    await animations.playMove(move);
    expect(pieces.snapshot().a8).toBe(pieceCode({ color: 'w', kind: 'n' }));
    expect(pieces.group.children).toHaveLength(3);
  });
});
