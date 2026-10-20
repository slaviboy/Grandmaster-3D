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

// The Captured Pieces window: a row per side with queen, rook, bishop, knight and pawn, and the
// number of each taken so far underneath.

import type { GameState } from '../game/GameController.ts';
import type { Color, PieceKind } from '../game/types.ts';
import { pieceSvg } from './icons.ts';
import { Panel } from './Panel.ts';

const ORDER: readonly PieceKind[] = ['q', 'r', 'b', 'n', 'p'];

export class CapturedPanel {
  readonly panel: Panel;
  private readonly counts: Record<Color, Record<string, HTMLElement>> = { w: {}, b: {} };
  private material: HTMLElement;

  constructor(onExpand: () => void) {
    this.panel = new Panel({
      id: 'captured-pieces',
      title: 'Captured Pieces',
      extraButtons: [{ label: '▸', title: 'Show material balance', onClick: onExpand }],
    });
    for (const color of ['w', 'b'] as const) {
      const row = document.createElement('div');
      row.className = 'captured-row';
      row.setAttribute(
        'aria-label',
        color === 'w' ? 'White pieces captured' : 'Black pieces captured',
      );
      for (const kind of ORDER) {
        const cell = document.createElement('div');
        cell.className = 'captured-cell';
        cell.innerHTML = `${pieceSvg(color, kind, 20)}<span class="count"></span>`;
        this.counts[color][kind] = cell.querySelector('.count')!;
        row.append(cell);
      }
      this.panel.body.append(row);
    }
    this.material = document.createElement('div');
    this.material.className = 'material';
    this.material.hidden = true;
    this.panel.body.append(this.material);
  }

  toggleMaterial(): void {
    this.material.hidden = !this.material.hidden;
  }

  render(state: GameState): void {
    const values: Record<PieceKind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let balance = 0;
    for (const color of ['w', 'b'] as const) {
      const lost = state.captured[color];
      for (const kind of ORDER) {
        const n = lost.filter((k) => k === kind).length;
        this.counts[color][kind]!.textContent = n > 0 ? String(n) : '';
        balance += (color === 'w' ? -1 : 1) * n * values[kind];
      }
    }
    this.material.textContent =
      balance === 0
        ? 'Material is even'
        : `${balance > 0 ? 'White' : 'Black'} is ahead by ${Math.abs(balance)}`;
  }
}
