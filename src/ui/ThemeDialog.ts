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

// The Board and Pieces dialog: tabs for the board, the piece set and the table, each with preset
// swatches and a Custom section of colour pickers. Every choice shows on the board at once; OK keeps
// it and Cancel (or Escape) puts back what was there before.

import type { Store } from '../core/Store.ts';
import type { Settings } from '../game/Settings.ts';
import {
  BOARD_THEMES,
  CUSTOM_ID,
  PIECE_THEMES,
  TABLE_THEMES,
  boardTheme,
  pieceTheme,
  tableTheme,
  type CustomColours,
} from '../scene/themes.ts';
import { el, openDialog } from './Dialog.ts';
import { boardSwatch, pieceSwatch, tableSwatch } from './swatches.ts';

type Tab = 'board' | 'pieces' | 'table';

interface TabSpec {
  readonly id: Tab;
  readonly label: string;
  readonly key: 'boardTheme' | 'pieceTheme' | 'tableTheme';
  readonly presets: ReadonlyArray<{ id: string; label: string }>;
  readonly swatch: (id: string, custom: CustomColours) => HTMLCanvasElement;
}

const TABS: readonly TabSpec[] = [
  {
    id: 'board',
    label: 'Board',
    key: 'boardTheme',
    presets: BOARD_THEMES,
    swatch: (id, custom) => boardSwatch(boardTheme(id, custom)),
  },
  {
    id: 'pieces',
    label: 'Pieces',
    key: 'pieceTheme',
    presets: PIECE_THEMES,
    swatch: (id, custom) => pieceSwatch(pieceTheme(id, custom)),
  },
  {
    id: 'table',
    label: 'Table',
    key: 'tableTheme',
    presets: TABLE_THEMES,
    swatch: (id, custom) => tableSwatch(tableTheme(id, custom)),
  },
];

export function themeDialog(settings: Store<Settings>, start: Tab = 'board'): Promise<boolean> {
  const before = settings.get();
  return openDialog<boolean>('Board and Pieces', false, ({ body, root, close }) => {
    root.classList.add('theme-dialog');
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const panes = new Map<Tab, HTMLElement>();
    const tabButtons = new Map<Tab, HTMLButtonElement>();

    const show = (tab: Tab) => {
      for (const [id, pane] of panes) pane.hidden = id !== tab;
      for (const [id, button] of tabButtons) {
        button.setAttribute('aria-selected', String(id === tab));
        button.tabIndex = id === tab ? 0 : -1;
      }
    };

    for (const spec of TABS) {
      const button = el('button', 'tab', spec.label);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.tab = spec.id;
      button.addEventListener('click', () => show(spec.id));
      tabButtons.set(spec.id, button);
      tabs.append(button);
      panes.set(spec.id, buildPane(spec, settings));
    }
    const actions = el('div', 'choice-row');
    const ok = el('button', 'btn', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', () => close(true));
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close(false));
    actions.append(ok, cancel);
    body.append(tabs, ...panes.values(), actions);
    show(start);
  }).then((kept) => {
    if (!kept) {
      settings.update({
        boardTheme: before.boardTheme,
        pieceTheme: before.pieceTheme,
        tableTheme: before.tableTheme,
        custom: before.custom,
      });
    }
    return kept;
  });
}

function buildPane(spec: TabSpec, settings: Store<Settings>): HTMLElement {
  const pane = el('div', 'tab-pane');
  pane.setAttribute('role', 'tabpanel');
  pane.dataset.pane = spec.id;
  const grid = el('div', 'swatch-grid');
  const buttons: HTMLButtonElement[] = [];

  const mark = () => {
    const current = settings.get()[spec.key];
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.theme === current));
  };
  const choose = (id: string) => {
    settings.update({ [spec.key]: id } as Partial<Settings>);
    mark();
  };

  const swatchButton = (id: string, label: string) => {
    const button = el('button', 'swatch');
    button.type = 'button';
    button.dataset.theme = id;
    button.title = label;
    button.append(spec.swatch(id, settings.get().custom), el('span', '', label));
    button.addEventListener('click', () => choose(id));
    buttons.push(button);
    return button;
  };
  for (const preset of spec.presets) grid.append(swatchButton(preset.id, preset.label));
  const customButton = swatchButton(CUSTOM_ID, 'Custom');
  grid.append(customButton);

  const refreshCustomSwatch = () => {
    customButton
      .querySelector('canvas')
      ?.replaceWith(spec.swatch(CUSTOM_ID, settings.get().custom));
  };
  const setCustom = (patch: Partial<CustomColours>) => {
    settings.update({
      custom: { ...settings.get().custom, ...patch },
      [spec.key]: CUSTOM_ID,
    } as Partial<Settings>);
    refreshCustomSwatch();
    mark();
  };

  const custom = el('div', 'custom-colours');
  custom.append(el('div', 'coach-heading', 'Custom colours'));
  const colourRow = (label: string, key: keyof CustomColours) => {
    const row = el('label', 'colour-row');
    const input = el('input');
    input.type = 'color';
    input.value = settings.get().custom[key] as string;
    input.dataset.custom = key;
    input.addEventListener('input', () =>
      setCustom({ [key]: input.value } as Partial<CustomColours>),
    );
    row.append(el('span', '', label), input);
    custom.append(row);
  };
  const selectRow = <K extends keyof CustomColours>(
    label: string,
    key: K,
    options: ReadonlyArray<[string, string]>,
  ) => {
    const row = el('label', 'colour-row');
    const select = el('select');
    select.dataset.custom = key;
    for (const [value, text] of options) {
      const option = el('option', '', text);
      option.value = value;
      option.selected = settings.get().custom[key] === value;
      select.append(option);
    }
    select.addEventListener('change', () =>
      setCustom({ [key]: select.value } as Partial<CustomColours>),
    );
    row.append(el('span', '', label), select);
    custom.append(row);
  };

  if (spec.id === 'board') {
    colourRow('Light squares', 'light');
    colourRow('Dark squares', 'dark');
    colourRow('Frame', 'frame');
    selectRow('Material', 'boardPattern', [
      ['wood', 'Wood'],
      ['marble', 'Marble'],
      ['plain', 'Plain'],
    ]);
  } else if (spec.id === 'pieces') {
    colourRow('White pieces', 'white');
    colourRow('Black pieces', 'black');
    selectRow('Finish', 'finish', [
      ['wood', 'Wood'],
      ['lacquer', 'Lacquer'],
      ['metal', 'Metal'],
      ['stone', 'Stone'],
      ['glass', 'Clear glass'],
      ['gloss', 'Polished glass'],
    ]);
  } else {
    colourRow('Table', 'table');
  }
  pane.append(grid, custom);
  mark();
  return pane;
}
