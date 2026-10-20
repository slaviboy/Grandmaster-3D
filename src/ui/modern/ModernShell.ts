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
// the menus and the main buttons runs along the top. The Coach card stands at the top left, the
// Match card (players, clocks and moves) at the right, where it keeps the board's framing of the
// retro layout, and the dock with the status and game buttons at the bottom centre.

import type { Color } from '../../game/types.ts';
import { el } from '../Dialog.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { MenuBar, type Menu, type MenuItem } from '../MenuBar.ts';
import type { Shell, ShellContext, ShellView } from '../shell.ts';
import { uiStyleSwitch } from '../UiStyleSwitch.ts';
import { CoachCard } from './CoachCard.ts';
import { iconButton } from './controls.ts';
import { Dock } from './Dock.ts';
import { MatchCard } from './MatchCard.ts';

export class ModernShell implements Shell {
  readonly element: HTMLElement;
  private readonly menu: MenuBar;
  private readonly match: MatchCard;
  private readonly coach: CoachCard;
  private readonly dock: Dock;

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
      uiStyleSwitch(app.settings),
      newGame,
      iconButton(LINE_ICONS.fullscreen, 'Full screen', () => commands.toggleFullscreen()),
    );
    top.append(brand, this.menu.element, end);

    this.match = new MatchCard(commands);
    this.coach = new CoachCard(
      {
        onAids: (aids) => ctx.setCoachAids(aids),
        onShowLegalMoves: (on) => app.settings.update({ showLegalMoves: on }),
        onHint: () => commands.hint(),
      },
      ctx.coachAids(),
      app.settings.get().showLegalMoves,
    );

    this.dock = new Dock(commands, () => app.camera.isTopView);

    this.element.append(top, this.coach.element, this.match.element, this.dock.element);
    app.root.append(this.element);

    // Small screens start with the move list folded so the board stays clear.
    if (window.innerWidth < 760) this.match.setMovesVisible(false);

    // On narrow windows the camera fits the board into the space left of the Match card.
    const reserve = () => {
      const rect = this.match.element.getBoundingClientRect();
      const covered = this.match.visible && window.innerWidth >= 760;
      app.camera.setReservedRight(covered ? window.innerWidth - rect.left : 0);
    };
    this.match.onChange(reserve);
    window.addEventListener('resize', reserve, { signal });
    reserve();
  }

  get menuOpen(): boolean {
    return this.menu.isOpen;
  }

  render({ state, settings, players, bottomColor, status }: ShellView): void {
    this.coach.syncLegalMoves(settings.showLegalMoves);
    this.match.render(state, players, bottomColor);
    this.dock.render(state, status);
  }

  renderClocks(times: Record<Color, number>, running: Color | null): void {
    this.match.renderClocks(times, running);
    this.dock.syncTopView();
  }

  say(text: string): void {
    this.coach.say(text);
  }

  clearLog(): void {
    this.coach.clear();
  }

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
          {
            label: '&Coach',
            checked: () => this.coach.visible,
            action: () => this.coach.setVisible(!this.coach.visible),
          },
          {
            label: 'M&atch Card',
            checked: () => this.match.visible,
            action: () => this.match.setVisible(!this.match.visible),
          },
          {
            label: 'Move &List',
            checked: () => this.match.visible && this.match.movesVisible,
            action: () => {
              const show = !(this.match.visible && this.match.movesVisible);
              this.match.setVisible(true);
              this.match.setMovesVisible(show);
            },
          },
          sep,
          { label: '&Full Screen', action: () => this.ctx.commands.toggleFullscreen() },
        ],
      },
      { label: '&Look', items: () => [...m.appearance(), sep, ...m.interface()] },
      { label: '&Options', items: () => [...m.effects(), sep, ...m.settings()] },
      { label: '&Help', items: m.help },
    ];
  }
}
