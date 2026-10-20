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

// The modern New Game sheet: pick the opponent by their portrait (or a custom rating), the side and
// the time control, all visible at once. It answers like the retro New Game dialog. A friend online
// takes the side and time from here; the link comes next.

import { DIFFICULTIES, type DifficultyId } from '../../engine/difficulty.ts';
import { TIME_CONTROLS, type Settings } from '../../game/Settings.ts';
import { el, openDialog } from '../Dialog.ts';
import { ratingSlider } from '../dialogs.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { opponentPortrait } from '../portraits.ts';
import { choiceGroup, segmented } from './controls.ts';

type Side = 'w' | 'b' | 'random';

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const wrap = el('div', 'm-section');
  wrap.append(el('div', 'coach-heading', title), ...content);
  return wrap;
}

export function newGameSheet(current: Settings): Promise<Partial<Settings> | null> {
  return openDialog<Partial<Settings> | null>('New Game', null, ({ body, root, close }) => {
    root.classList.add('new-game-sheet');
    let mode = current.mode;
    let level: DifficultyId = current.difficulty;
    let side: Side = current.humanColor;
    let minutes = TIME_CONTROLS.includes(current.minutes) ? current.minutes : 10;

    const [ratingField, rating] = ratingSlider(current.customRating);
    const ratingInput = ratingField.querySelector('input')!;

    const opponent = segmented<Settings['mode']>(
      'Opponent',
      [
        ['computer', 'Against the computer'],
        ['local', 'Two players'],
        ['online', 'A friend online'],
      ],
      mode,
      (value) => {
        mode = value;
        update();
      },
    );

    const levels = choiceGroup<DifficultyId>(
      'Strength',
      [
        ...DIFFICULTIES.map((d) => {
          const portrait = opponentPortrait(d.id, d.rating);
          return {
            value: d.id,
            label: `${d.label}, about ${d.rating}`,
            html: `<img src="${portrait.src}" alt="" draggable="false"><span class="m-level-text"><span class="m-level-name">${d.label}</span><span class="m-level-rating">Rated ${d.rating}</span></span>`,
          };
        }),
        {
          value: 'custom' as const,
          label: 'Custom rating',
          html: `<span class="m-level-art">${LINE_ICONS.sliders}</span><span class="m-level-text"><span class="m-level-name">Custom</span><span class="m-level-rating">Rated <span class="m-custom-rating">${current.customRating}</span></span></span>`,
        },
      ],
      level,
      (value) => {
        level = value;
        update();
      },
      'm-levels',
      'm-level',
    );
    const customRating = levels.element.querySelector<HTMLElement>('.m-custom-rating')!;
    ratingInput.addEventListener('input', () => (customRating.textContent = ratingInput.value));

    const sides = choiceGroup<Side>(
      'You play',
      [
        { value: 'w', label: 'White', html: `${pieceSvg('w', 'k', 34)}<span>White</span>` },
        {
          value: 'random',
          label: 'Random side',
          html: `<span class="m-side-pair">${pieceSvg('w', 'k', 26)}${pieceSvg('b', 'k', 26)}</span><span>Random</span>`,
        },
        { value: 'b', label: 'Black', html: `${pieceSvg('b', 'k', 34)}<span>Black</span>` },
      ],
      side,
      (value) => (side = value),
      'm-sides',
      'm-side',
    );

    const time = segmented<string>(
      'Time control',
      TIME_CONTROLS.map((m) => [String(m), m === 0 ? 'Untimed' : `${m} min`] as const),
      String(minutes),
      (value) => (minutes = Number(value)),
    );

    const strength = section('Strength', levels.element, ratingField);
    const yourSide = section('You play', sides.element);

    const update = () => {
      const local = mode === 'local';
      const person = mode !== 'computer';
      strength.hidden = person;
      yourSide.hidden = local;
      ratingField.hidden = person || level !== 'custom';
      start.textContent = mode === 'online' ? 'Create Link' : 'Start Game';
    };
    const actions = el('div', 'dialog-actions');
    const start = el('button', 'btn', 'Start Game');
    start.type = 'button';
    start.setAttribute('autofocus', '');
    start.addEventListener('click', () =>
      close({
        mode,
        humanColor: side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side,
        difficulty: level,
        customRating: rating(),
        minutes,
      }),
    );
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close(null));
    actions.append(start, cancel);
    update();

    body.append(
      section('Opponent', opponent.element),
      strength,
      yourSide,
      section('Time per player', time.element),
      actions,
    );
  });
}
