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

// The modern interface: floating dark-glass cards around the board. A top bar with the wordmark,
// the menus and the main buttons runs along the top.

import type { Color } from '../../game/types.ts';
import { el } from '../Dialog.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { MenuBar, type Menu, type MenuItem } from '../MenuBar.ts';
import type { Shell, ShellContext, ShellView } from '../shell.ts';

/** A button with an icon and an optional visible label; the label also names it for tooltips. */
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

export class ModernShell implements Shell {
  readonly element: HTMLElement;
  private readonly menu: MenuBar;

  constructor(private readonly ctx: ShellContext) {
    const { app, commands, signal } = ctx;
    this.element = el('div', 'm-ui');

    const top = el('header', 'm-topbar');
    const brand = el('div', 'm-brand');
    brand.setAttribute('aria-label', 'Grandmaster 3D');
    brand.innerHTML = `<span class="m-brand-mark">${pieceSvg('w', 'k', 24)}</span><span class="m-brand-name" aria-hidden="true">Grandmaster<small>3D</small></span>`;
    this.menu = new MenuBar(this.menus(), { signal, variant: 'modern' });
    const end = el('div', 'm-topbar-end');
    const newGame = el('button', 'm-btn m-btn-primary m-new-game');
    newGame.type = 'button';
    newGame.innerHTML = `${LINE_ICONS.plus}<span>New game</span>`;
    newGame.setAttribute('aria-label', 'New game (Ctrl+N)');
    newGame.addEventListener('click', () => commands.newGame());
    end.append(
      newGame,
      iconButton(LINE_ICONS.fullscreen, 'Full screen', () => commands.toggleFullscreen()),
    );
    top.append(brand, this.menu.element, end);

    this.element.append(top);
    app.root.append(this.element);
    app.camera.setReservedRight(0);
  }

  get menuOpen(): boolean {
    return this.menu.isOpen;
  }

  render(_view: ShellView): void {}

  renderClocks(_times: Record<Color, number>, _running: Color | null): void {}

  say(_text: string): void {}

  clearLog(): void {}

  dispose(): void {
    this.menu.close();
    this.element.remove();
  }

  private menus(): Menu[] {
    const m = this.ctx.menu;
    const sep: MenuItem = { separator: true };
    return [
      {
        label: '&Game',
        items: () => [
          ...m.file(),
          sep,
          ...m.sides(),
          ...m.difficulty(),
          ...m.timeControl(),
          sep,
          ...m.history(),
          ...m.moveNow(),
          ...m.suggest(),
          sep,
          ...m.resign(),
        ],
      },
      {
        label: '&View',
        items: () => [
          ...m.camera(),
          sep,
          ...m.coordinates(),
          ...m.marks(),
          sep,
          { label: '&Full Screen', action: () => this.ctx.commands.toggleFullscreen() },
        ],
      },
      { label: '&Look', items: m.appearance },
      { label: '&Options', items: () => [...m.effects(), sep, ...m.settings()] },
      { label: '&Help', items: m.help },
    ];
  }
}
