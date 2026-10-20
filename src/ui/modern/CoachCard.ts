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

// The modern Coach card, top left. Folded, it is one line with the coach's latest remark; opened,
// it holds the board aids (legal, capture and check moves, isolated or passed pawns, danger and
// safe zones, board coverage), a button that suggests a move and the running commentary.

import type { BoardAid, PawnAid } from '../../game/coach.ts';
import { el } from '../Dialog.ts';
import { GLYPHS, LINE_ICONS } from '../icons.ts';
import type { CoachAids } from '../shell.ts';
import { segmented, switchRow } from './controls.ts';

export interface CoachCardCallbacks {
  onAids(aids: CoachAids): void;
  onShowLegalMoves(on: boolean): void;
  onHint(): void;
}

const IDLE = 'Hints, board aids and commentary';

export class CoachCard {
  readonly element: HTMLElement;
  private readonly head: HTMLButtonElement;
  private readonly preview: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly legal: HTMLInputElement;
  private aids: CoachAids;

  constructor(
    private readonly callbacks: CoachCardCallbacks,
    initial: CoachAids,
    showLegalMoves: boolean,
  ) {
    this.aids = { ...initial };
    this.element = el('section', 'm-card m-coach');
    this.element.id = 'coach-card';
    this.element.setAttribute('aria-label', 'Coach');

    this.head = el('button', 'm-coach-head');
    this.head.type = 'button';
    this.head.setAttribute('aria-controls', 'coach-body');
    this.head.innerHTML = `<span class="m-coach-icon">${LINE_ICONS.coach}</span><span class="m-coach-title">Coach</span><span class="m-coach-preview"></span><span class="m-coach-chev">${LINE_ICONS.chevronDown}</span>`;
    this.preview = this.head.querySelector('.m-coach-preview')!;
    this.preview.textContent = IDLE;
    this.head.addEventListener('click', () => this.setExpanded(!this.expanded));

    const body = el('div', 'm-coach-body');
    body.id = 'coach-body';
    body.append(el('div', 'm-label', 'Highlight'));
    const [legalRow, legal] = switchRow('All legal moves', showLegalMoves, (on) =>
      callbacks.onShowLegalMoves(on),
    );
    this.legal = legal;
    body.append(
      legalRow,
      switchRow('Capture moves', initial.captureMoves, (on) =>
        this.change({ captureMoves: on }),
      )[0],
      switchRow('Check moves', initial.checkMoves, (on) => this.change({ checkMoves: on }))[0],
    );
    body.append(el('div', 'm-label', 'Pawns'));
    body.append(
      segmented<PawnAid>(
        'Pawns',
        [
          ['off', 'Off'],
          ['isolated', 'Isolated'],
          ['passed', 'Passed'],
        ],
        initial.pawns,
        (pawns) => this.change({ pawns }),
      ).element,
    );
    body.append(el('div', 'm-label', 'Board'));
    body.append(
      segmented<BoardAid>(
        'Board',
        [
          ['off', 'Off'],
          ['danger', 'Danger'],
          ['safe', 'Safe'],
          ['coverage', 'Coverage'],
        ],
        initial.board,
        (board) => this.change({ board }),
        'm-segmented m-segmented-grid',
      ).element,
    );
    const hint = el('button', 'm-btn m-coach-hint');
    hint.type = 'button';
    hint.innerHTML = `${GLYPHS.hint}<span>Suggest a move</span>`;
    hint.addEventListener('click', () => callbacks.onHint());
    body.append(hint, el('div', 'm-label', 'Commentary'));
    this.feed = el('div', 'm-feed');
    this.feed.setAttribute('aria-live', 'polite');
    body.append(this.feed);

    this.element.append(this.head, body);
    this.setExpanded(false);
  }

  get expanded(): boolean {
    return this.element.classList.contains('open');
  }

  setExpanded(open: boolean): void {
    this.element.classList.toggle('open', open);
    this.head.setAttribute('aria-expanded', String(open));
    this.head.title = open ? 'Fold the coach' : 'Open the coach';
    if (open) this.feed.scrollTop = this.feed.scrollHeight;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  syncLegalMoves(on: boolean): void {
    this.legal.checked = on;
  }

  say(text: string): void {
    if (!text) return;
    const line = el('p', '', text);
    this.feed.append(line);
    while (this.feed.childElementCount > 40) this.feed.firstElementChild?.remove();
    this.feed.scrollTop = this.feed.scrollHeight;
    this.preview.textContent = text;
    // Restart the fade so a new remark catches the eye on the folded card.
    this.preview.classList.remove('fresh');
    void this.preview.offsetWidth;
    this.preview.classList.add('fresh');
  }

  clear(): void {
    this.feed.replaceChildren();
    this.preview.textContent = IDLE;
  }

  private change(patch: Partial<CoachAids>): void {
    this.aids = { ...this.aids, ...patch };
    this.callbacks.onAids(this.aids);
  }
}
