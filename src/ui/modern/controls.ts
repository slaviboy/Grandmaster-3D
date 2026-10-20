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

// Small controls of the modern interface: icon buttons with tooltips, switches and segmented
// choices. The segmented choice is a radio group: arrow keys move the choice, as with radios.

import { el } from '../Dialog.ts';

/** A button showing only an icon; the label names it for screen readers and its tooltip. */
export function iconButton(
  icon: string,
  label: string,
  onClick: () => void,
  className = 'm-icon-btn',
): HTMLButtonElement {
  const button = el('button', className);
  button.type = 'button';
  button.innerHTML = icon;
  button.setAttribute('aria-label', label);
  button.dataset.tip = label;
  button.addEventListener('click', onClick);
  return button;
}

/** A labelled on/off switch; returns the row and its checkbox. */
export function switchRow(
  label: string,
  checked: boolean,
  onChange: (on: boolean) => void,
): [HTMLElement, HTMLInputElement] {
  const row = el('label', 'm-switch-row');
  const input = el('input', 'm-switch');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(el('span', '', label), input);
  return [row, input];
}

export interface Segmented<T extends string> {
  readonly element: HTMLElement;
  value: T;
}

/** A row of mutually exclusive choices. */
export function segmented<T extends string>(
  label: string,
  choices: ReadonlyArray<readonly [T, string]>,
  current: T,
  onChange: (value: T) => void,
  className = 'm-segmented',
): Segmented<T> {
  const group = el('div', className);
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const buttons: HTMLButtonElement[] = [];
  let value = current;
  const mark = () => {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (next: T, focus = false) => {
    if (next !== value) {
      value = next;
      mark();
      onChange(next);
    }
    if (focus) buttons.find((b) => b.dataset.value === next)?.focus();
  };
  choices.forEach(([v, text], index) => {
    const button = el('button', 'm-segment', text);
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.title = text;
    button.dataset.value = v;
    button.addEventListener('click', () => choose(v));
    button.addEventListener('keydown', (event) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0;
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const next = choices[(index + step + choices.length) % choices.length]!;
      choose(next[0], true);
    });
    buttons.push(button);
    group.append(button);
  });
  mark();
  return {
    element: group,
    get value() {
      return value;
    },
    set value(next: T) {
      value = next;
      mark();
    },
  };
}
