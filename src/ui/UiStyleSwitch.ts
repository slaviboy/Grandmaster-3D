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

// The Modern | Retro switch in the top bar of both interfaces. Choosing the other style saves it,
// and UiRoot puts up that interface at once; each interface styles the switch its own way.

import type { Store } from '../core/Store.ts';
import type { Settings, UiStyle } from '../game/Settings.ts';
import { el } from './Dialog.ts';

const STYLES: ReadonlyArray<[UiStyle, string]> = [
  ['modern', 'Modern'],
  ['retro', 'Retro'],
];

export function uiStyleSwitch(settings: Store<Settings>): HTMLElement {
  const group = el('div', 'ui-switch');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Interface style');
  group.title = 'Interface style';
  const current = settings.get().uiStyle;
  for (const [style, label] of STYLES) {
    const option = el('button', 'ui-switch-option', label);
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(style === current));
    option.tabIndex = style === current ? 0 : -1;
    option.dataset.style = style;
    option.addEventListener('click', () => settings.update({ uiStyle: style }));
    option.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      settings.update({ uiStyle: style === 'modern' ? 'retro' : 'modern' });
    });
    group.append(option);
  }
  return group;
}
