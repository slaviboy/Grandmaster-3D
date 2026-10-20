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

// The bottom of the screen, as in the reference: on the left a tab with a pawn pair that shows whose
// turn it is and an arrow that slides out the game buttons; on the right a strip of round buttons;
// and a status line along the bottom edge.

import type { Color } from '../game/types.ts';
import { GLYPHS, pieceSvg } from './icons.ts';

export interface BottomBarActions {
  newGame(): void;
  undo(): void;
  redo(): void;
  resign(): void;
  hint(): void;
  flip(): void;
  settings(): void;
  toggleMoves(): void;
}

function roundButton(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'round-button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = glyph;
  button.addEventListener('click', onClick);
  return button;
}

export class BottomBar {
  readonly element: HTMLElement;
  readonly status: HTMLElement;
  private readonly turn: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;

  constructor(actions: BottomBarActions) {
    this.element = document.createElement('div');
    this.element.className = 'bottom-bar';

    const left = document.createElement('div');
    left.className = 'turn-tab';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'tab-arrow';
    up.title = 'Move list';
    up.setAttribute('aria-label', 'Show or hide the move list');
    up.addEventListener('click', actions.toggleMoves);
    this.turn = document.createElement('div');
    this.turn.className = 'turn-indicator';
    this.turn.innerHTML = `<span data-color="b">${pieceSvg('b', 'p', 26)}</span><span data-color="w">${pieceSvg('w', 'p', 26)}</span>`;
    left.append(up, this.turn);

    const slide = document.createElement('button');
    slide.type = 'button';
    slide.className = 'slide-arrow';
    slide.title = 'Game buttons';
    slide.setAttribute('aria-label', 'Show or hide the game buttons');
    slide.setAttribute('aria-expanded', 'false');
    this.tray = document.createElement('div');
    this.tray.className = 'button-tray';
    this.undoButton = roundButton(GLYPHS.undo, 'Take back (Ctrl+Z)', actions.undo);
    this.redoButton = roundButton(GLYPHS.redo, 'Replay (Ctrl+Y)', actions.redo);
    const main = roundButton(pieceSvg('w', 'k', 30), 'New game (Ctrl+N)', actions.newGame);
    main.classList.add('main-round');
    this.tray.append(
      this.undoButton,
      this.redoButton,
      roundButton(GLYPHS.resign, 'Resign', actions.resign),
    );
    slide.addEventListener('click', () => {
      const open = !this.tray.classList.contains('open');
      this.tray.classList.toggle('open', open);
      slide.classList.toggle('open', open);
      slide.setAttribute('aria-expanded', String(open));
    });

    const right = document.createElement('div');
    right.className = 'action-strip';
    right.append(
      roundButton(GLYPHS.hint, 'Hint (H)', actions.hint),
      roundButton(GLYPHS.flip, 'Flip board (F)', actions.flip),
      roundButton(GLYPHS.settings, 'Settings', actions.settings),
    );

    this.status = document.createElement('div');
    this.status.className = 'status-line';
    this.status.setAttribute('role', 'status');

    this.element.append(left, slide, main, this.tray, right, this.status);
  }

  render(turn: Color, over: boolean, canUndo: boolean, canRedo: boolean, status: string): void {
    for (const span of this.turn.querySelectorAll<HTMLElement>('span')) {
      span.classList.toggle('active', !over && span.dataset.color === turn);
    }
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
    this.status.textContent = status;
  }
}
