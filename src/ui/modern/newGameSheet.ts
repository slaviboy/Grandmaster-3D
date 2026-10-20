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
// the time control, all visible at once. The opponents show as a slider of big cards (the default)
// or a compact grid; the player's choice of view is remembered. It answers like the retro New Game dialog. A friend online
// takes the side and time from here; the link comes next.

import { DIFFICULTIES, type DifficultyId } from '../../engine/difficulty.ts';
import { TIME_CONTROLS, type LevelView, type Settings } from '../../game/Settings.ts';
import { el, openDialog } from '../Dialog.ts';
import { ratingSlider } from '../dialogs.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { opponentPortrait } from '../portraits.ts';
import { carousel, choiceGroup, segmented } from './controls.ts';

type Side = 'w' | 'b' | 'random';

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const wrap = el('div', 'm-section');
  wrap.append(el('div', 'coach-heading', title), ...content);
  return wrap;
}

export interface SheetOptions {
  /** Called when the player switches between the slider and the compact grid. */
  readonly onLevelView?: (view: LevelView) => void;
}

export function newGameSheet(
  current: Settings,
  { onLevelView }: SheetOptions = {},
): Promise<Partial<Settings> | null> {
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

    const levelChoices = [
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
    ];
    // Two views of one choice: the slider of big cards and the compact grid, kept in step.
    const chooseLevel = (value: DifficultyId) => {
      level = value;
      slider.select(value);
      grid.select(value);
      update();
    };
    const slider = carousel<DifficultyId>(
      'Strength',
      'opponent',
      levelChoices,
      level,
      chooseLevel,
      'm-level',
    );
    const grid = choiceGroup<DifficultyId>(
      'Strength',
      levelChoices,
      level,
      chooseLevel,
      'm-levels',
      'm-level',
    );
    const customRatings = [slider, grid].map((view) =>
      view.element.querySelector<HTMLElement>('.m-custom-rating')!,
    );
    ratingInput.addEventListener('input', () => {
      for (const label of customRatings) label.textContent = ratingInput.value;
    });

    let view = current.levelView;
    const views = choiceGroup<LevelView>(
      'Show opponents as',
      [
        { value: 'slider', label: 'Slider', html: LINE_ICONS.slider },
        { value: 'compact', label: 'Compact', html: LINE_ICONS.grid },
      ],
      view,
      (value) => {
        view = value;
        onLevelView?.(value);
        update();
      },
      'm-view-toggle',
      'm-view-btn',
    );
    for (const button of views.element.querySelectorAll<HTMLElement>('.m-view-btn')) {
      button.dataset.tip = button.getAttribute('aria-label') ?? '';
    }

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

    const strengthHead = el('div', 'm-section-head');
    strengthHead.append(el('div', 'coach-heading', 'Strength'), views.element);
    const strength = el('div', 'm-section');
    strength.append(strengthHead, slider.element, grid.element, ratingField);
    const yourSide = section('You play', sides.element);

    const update = () => {
      const local = mode === 'local';
      const person = mode !== 'computer';
      strength.hidden = person;
      slider.element.hidden = view !== 'slider';
      grid.element.hidden = view !== 'compact';
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
