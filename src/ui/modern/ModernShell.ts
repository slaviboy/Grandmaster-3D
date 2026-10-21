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
// retro layout, and the dock with the status and game buttons at the bottom centre. On an upright
// phone the cards stack under the top bar instead, the players side by side, and the board sits
// between them and the dock.

import type { Color } from '../../game/types.ts';
import type { MediaView } from '../cardMedia.ts';
import { el } from '../Dialog.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { MenuBar, type Menu, type MenuItem } from '../MenuBar.ts';
import { sideReach, type Shell, type ShellContext, type ShellView } from '../shell.ts';
import { uiStyleSwitch } from '../UiStyleSwitch.ts';
import { CoachCard } from './CoachCard.ts';
import { iconButton } from './controls.ts';
import { Dock } from './Dock.ts';
import { MatchCard } from './MatchCard.ts';

/** An upright phone; the same query as the phone layout in modern.css. */
const PHONE = '(max-width: 760px) and (orientation: portrait)';

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

    this.dock = new Dock(commands, () => (app.boardView === '3d' ? app.camera.isTopView : null));

    this.element.append(top, this.coach.element, this.match.element, this.dock.element);
    app.root.append(this.element);

    // Small screens start with the move list folded so the board stays clear.
    if (window.innerWidth < 760) this.match.setMovesVisible(false);

    // On narrow windows the camera fits the board into the space left of the Match card. On an
    // upright phone it fits it between the cards at the top and the dock at the bottom; the coach
    // counts by its head only, so opening it lays it over the board instead of moving the board.
    // The 2D board always keeps clear of the top bar and the dock, and of the cards beside it.
    const phone = window.matchMedia(PHONE);
    const reserve = () => {
      const area = app.root.getBoundingClientRect();
      const bottom = Math.max(0, area.bottom - this.dock.element.getBoundingClientRect().top);
      if (phone.matches) {
        const cards = [top];
        if (this.match.visible) cards.push(this.match.element);
        if (this.coach.visible) cards.push(this.coach.head);
        const cardsEnd = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
        const edges = { top: Math.max(0, cardsEnd - area.top), right: 0, bottom };
        app.camera.setReserved(edges);
        app.setCovered({ ...edges, left: 0 });
        return;
      }
      const rect = this.match.element.getBoundingClientRect();
      const wide = window.innerWidth >= 760;
      const covered = this.match.visible && wide;
      app.camera.setReserved({
        top: 0,
        right: covered ? area.right - rect.left : 0,
        bottom: 0,
      });
      app.setCovered({
        top: Math.max(0, top.getBoundingClientRect().bottom - area.top),
        bottom,
        ...(wide
          ? sideReach(area, [this.coach.element, this.match.element])
          : { left: 0, right: 0 }),
      });
    };
    // The cards change size as they fold, hide, show a video or wrap their text.
    const resized = new ResizeObserver(reserve);
    for (const card of [top, this.match.element, this.coach.element, this.dock.element]) {
      resized.observe(card);
    }
    signal.addEventListener('abort', () => resized.disconnect());
    this.match.onChange(reserve);
    phone.addEventListener('change', reserve, { signal });
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

  setMedia(view: MediaView | null): void {
    this.match.setMedia(view);
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
          ...m.boardView(),
          sep,
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
