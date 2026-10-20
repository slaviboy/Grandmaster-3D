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

// The modern dock, bottom centre below the board: whose turn it is with the game's status line,
// then the buttons used during a game.

import type { GameState } from '../../game/GameController.ts';
import { el } from '../Dialog.ts';
import { GLYPHS, LINE_ICONS, pieceSvg } from '../icons.ts';
import type { Commands } from '../shell.ts';
import { iconButton } from './controls.ts';

export class Dock {
  readonly element: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly piece: HTMLElement;
  private readonly status: HTMLElement;
  private readonly undo: HTMLButtonElement;
  private readonly redo: HTMLButtonElement;
  private readonly resign: HTMLButtonElement;
  private readonly topView: HTMLButtonElement;
  private shownTurn = '';

  constructor(
    commands: Commands,
    private readonly isTopView: () => boolean,
  ) {
    this.element = el('div', 'm-dock');
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Game controls');

    this.chip = el('div', 'm-turn');
    this.piece = el('span', 'm-turn-piece');
    this.status = el('span', 'm-turn-text');
    this.status.setAttribute('role', 'status');
    this.chip.append(this.piece, this.status);

    this.undo = iconButton(GLYPHS.undo, 'Take back (Ctrl+Z)', () => commands.undo());
    this.redo = iconButton(GLYPHS.redo, 'Replay (Ctrl+Y)', () => commands.redo());
    this.topView = iconButton(LINE_ICONS.topView, 'Top view (T)', () => {
      commands.topView();
      this.syncTopView();
    });
    this.resign = iconButton(GLYPHS.resign, 'Resign', () => commands.resign());
    this.resign.classList.add('m-danger');
    const sep = () => el('span', 'm-dock-sep');
    this.element.append(
      this.chip,
      this.undo,
      this.redo,
      sep(),
      iconButton(GLYPHS.hint, 'Hint (H)', () => commands.hint()),
      iconButton(GLYPHS.flip, 'Flip board (F)', () => commands.flip()),
      this.topView,
      sep(),
      this.resign,
      iconButton(GLYPHS.settings, 'Settings', () => commands.settings()),
    );
  }

  render(state: GameState, status: string): void {
    const playing = state.status.kind === 'playing';
    const turn = playing ? state.turn : '';
    if (turn !== this.shownTurn) {
      this.shownTurn = turn;
      this.piece.innerHTML = turn ? pieceSvg(turn, 'k', 22) : LINE_ICONS.check;
    }
    this.chip.classList.toggle('over', !playing);
    this.chip.classList.toggle('thinking', state.phase === 'engineThinking');
    this.chip.classList.toggle(
      'yours',
      playing && state.mode === 'computer' && state.turn === state.humanColor,
    );
    this.status.textContent = status;
    this.undo.disabled = !state.canUndo;
    this.redo.disabled = !state.canRedo;
    this.resign.disabled = !playing;
    this.syncTopView();
  }

  /** The top view can also change from the keyboard; the shell calls this a few times a second. */
  syncTopView(): void {
    this.topView.setAttribute('aria-pressed', String(this.isTopView()));
  }
}
