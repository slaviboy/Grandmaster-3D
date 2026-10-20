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

// The Chess Coach window: board aids (legal, capture and check moves, danger and safe zones, board
// coverage, isolated and passed pawns), a hint button and a running commentary. It starts
// collapsed to its header, as in the reference.

import type { BoardAid, CoachOptions, PawnAid } from '../game/coach.ts';
import { Panel } from './Panel.ts';

export interface CoachSettings {
  readonly showLegalMoves: boolean;
}

export interface CoachCallbacks {
  onOptions(options: Omit<CoachOptions, 'side'>): void;
  onShowLegalMoves(on: boolean): void;
  onHint(): void;
}

export class CoachPanel {
  readonly panel: Panel;
  private readonly log: HTMLElement;
  private readonly legal: HTMLInputElement;
  private options: Omit<CoachOptions, 'side'> = {
    captureMoves: false,
    checkMoves: false,
    board: 'off',
    pawns: 'off',
  };

  constructor(private readonly callbacks: CoachCallbacks) {
    this.panel = new Panel({ id: 'chess-coach', title: 'Chess Coach', collapsed: true });
    const body = this.panel.body;

    body.append(this.heading('Moves'));
    this.legal = this.checkbox(body, 'All legal moves', true, (on) =>
      callbacks.onShowLegalMoves(on),
    );
    this.checkbox(body, 'Capture moves', false, (on) => this.change({ captureMoves: on }));
    this.checkbox(body, 'Check moves', false, (on) => this.change({ checkMoves: on }));

    body.append(this.heading('Pieces'));
    this.radios<PawnAid>(
      body,
      'coach-pawns',
      [
        ['off', 'Off'],
        ['isolated', 'Isolated pawns'],
        ['passed', 'Passed pawns'],
      ],
      (pawns) => this.change({ pawns }),
    );

    body.append(this.heading('Board'));
    this.radios<BoardAid>(
      body,
      'coach-board',
      [
        ['off', 'Off'],
        ['danger', 'Danger zones'],
        ['safe', 'Safe zones'],
        ['coverage', 'Board coverage'],
      ],
      (board) => this.change({ board }),
    );

    body.append(this.heading('Show Hints'));
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'btn coach-hint';
    hint.textContent = 'Suggest a move';
    hint.addEventListener('click', () => callbacks.onHint());
    body.append(hint);

    body.append(this.heading('Coach'));
    this.log = document.createElement('div');
    this.log.className = 'coach-log';
    this.log.setAttribute('aria-live', 'polite');
    body.append(this.log);
  }

  syncLegalMoves(on: boolean): void {
    this.legal.checked = on;
  }

  say(text: string): void {
    if (!text) return;
    const line = document.createElement('p');
    line.textContent = text;
    this.log.append(line);
    while (this.log.childElementCount > 40) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  clear(): void {
    this.log.replaceChildren();
  }

  private change(patch: Partial<Omit<CoachOptions, 'side'>>): void {
    this.options = { ...this.options, ...patch };
    this.callbacks.onOptions(this.options);
  }

  private heading(text: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'coach-heading';
    h.textContent = text;
    return h;
  }

  private checkbox(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
  ): HTMLInputElement {
    const row = document.createElement('label');
    row.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    row.append(input, document.createTextNode(label));
    parent.append(row);
    return input;
  }

  private radios<T extends string>(
    parent: HTMLElement,
    name: string,
    choices: ReadonlyArray<[T, string]>,
    onChange: (value: T) => void,
  ): void {
    choices.forEach(([value, label], index) => {
      const row = document.createElement('label');
      row.className = 'check';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = index === 0;
      input.addEventListener('change', () => input.checked && onChange(value));
      row.append(input, document.createTextNode(label));
      parent.append(row);
    });
  }
}
