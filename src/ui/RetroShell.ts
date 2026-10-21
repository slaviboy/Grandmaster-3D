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

// The retro interface, laid out like the reference: a title bar with the wordmark and window
// buttons, the menu bar, the Chess Coach on the left, Game Status and Captured Pieces on the right,
// the turn tab and round buttons at the bottom and a status line.

import type { Color } from '../game/types.ts';
import type { MediaView } from './cardMedia.ts';
import { BottomBar } from './BottomBar.ts';
import { CapturedPanel } from './CapturedPanel.ts';
import { CoachPanel } from './CoachPanel.ts';
import { GameStatusPanel } from './GameStatusPanel.ts';
import { MenuBar, type Menu, type MenuItem } from './MenuBar.ts';
import type { Panel } from './Panel.ts';
import { sideReach, type Shell, type ShellContext, type ShellView } from './shell.ts';
import { uiStyleSwitch } from './UiStyleSwitch.ts';

export class RetroShell implements Shell {
  readonly element: HTMLElement;
  private readonly status: GameStatusPanel;
  private readonly captured: CapturedPanel;
  private readonly coach: CoachPanel;
  private readonly bottom: BottomBar;
  private readonly menu: MenuBar;

  constructor(private readonly ctx: ShellContext) {
    const { app, commands, signal } = ctx;
    this.element = document.createElement('div');
    this.element.className = 'ui';

    const titleBar = document.createElement('header');
    titleBar.className = 'title-bar';
    titleBar.innerHTML = `<div class="wordmark" aria-label="Grandmaster 3D"><span class="wm-main">Grandmaster</span><span class="wm-sub">3D Edition</span></div>`;
    const windowButtons = document.createElement('div');
    windowButtons.className = 'window-buttons';
    const winButton = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `win-${label}`;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', onClick);
      windowButtons.append(b);
    };
    winButton('min', 'Collapse all windows', () => this.collapseAll());
    winButton('max', 'Full screen', () => commands.toggleFullscreen());
    winButton('close', 'Hide all windows', () => this.toggleAllPanels());
    titleBar.append(uiStyleSwitch(app.settings), windowButtons);

    this.menu = new MenuBar(this.menus(), { signal });
    titleBar.append(this.menu.element);

    this.coach = new CoachPanel(
      {
        onOptions: (options) => ctx.setCoachAids(options),
        onShowLegalMoves: (on) => app.settings.update({ showLegalMoves: on }),
        onHint: () => commands.hint(),
      },
      ctx.coachAids(),
    );
    this.status = new GameStatusPanel(
      {
        first: () => commands.undoAll(),
        back: () => commands.undo(),
        pause: () => commands.moveNow(),
        forward: () => commands.redo(),
        last: () => commands.redoAll(),
      },
      commands,
    );
    this.captured = new CapturedPanel(() => this.captured.toggleMaterial());
    const right = document.createElement('div');
    right.className = 'right-column';
    right.append(this.status.panel.element, this.captured.panel.element);

    this.bottom = new BottomBar({
      newGame: () => commands.newGame(),
      undo: () => commands.undo(),
      redo: () => commands.redo(),
      resign: () => commands.resign(),
      hint: () => commands.hint(),
      flip: () => commands.flip(),
      settings: () => commands.settings(),
      toggleMoves: () => {
        this.status.panel.setCollapsed(false);
        this.status.setMoveListVisible(!this.status.moveListVisible);
      },
    });

    this.element.append(titleBar, this.coach.panel.element, right, this.bottom.element);
    app.root.append(this.element);

    // Small screens start with the side windows folded away so the board stays clear.
    if (window.innerWidth < 760) {
      this.status.panel.setCollapsed(true);
      this.captured.panel.setCollapsed(true);
    }

    // Keep the 3D board clear of the right-hand panels on narrower windows. The 2D board always
    // keeps clear of the title bar and the status line, and of the windows and buttons beside it.
    const reserve = () => {
      const open = [this.status.panel, this.captured.panel].some((p) => p.visible && !p.collapsed);
      const wide = window.innerWidth >= 760;
      const width = open && wide ? right.getBoundingClientRect().width : 0;
      app.camera.setReserved({ top: 0, right: width, bottom: 0 });
      const area = app.root.getBoundingClientRect();
      app.setCovered({
        top: Math.max(0, titleBar.getBoundingClientRect().bottom - area.top),
        bottom: Math.max(0, area.bottom - this.bottom.status.getBoundingClientRect().top),
        ...(wide
          ? sideReach(area, [this.coach.panel.element, right, ...this.bottom.corners])
          : { left: 0, right: 0 }),
      });
    };
    for (const panel of this.panels()) panel.onChange(reserve);
    window.addEventListener('resize', reserve, { signal });
    reserve();
  }

  get menuOpen(): boolean {
    return this.menu.isOpen;
  }

  render({ state, settings, players, bottomColor, status }: ShellView): void {
    this.coach.syncLegalMoves(settings.showLegalMoves);
    this.status.render(state, players, bottomColor);
    this.captured.render(state);
    const over = state.status.kind !== 'playing';
    this.bottom.render(state.turn, over, state.canUndo, state.canRedo, status);
  }

  renderClocks(times: Record<Color, number>, running: Color | null): void {
    this.status.renderClocks(times, running);
  }

  setMedia(view: MediaView | null): void {
    this.status.setMedia(view);
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

  private collapseAll(): void {
    const panels = this.panels();
    const collapse = panels.some((p) => !p.collapsed);
    for (const p of panels) p.setCollapsed(collapse);
  }

  private toggleAllPanels(): void {
    const panels = this.panels();
    const show = panels.every((p) => !p.visible);
    for (const p of panels) p.setVisible(show);
  }

  private panels(): Panel[] {
    return [this.coach.panel, this.status.panel, this.captured.panel];
  }

  private menus(): Menu[] {
    const m = this.ctx.menu;
    const sep: MenuItem = { separator: true };
    return [
      { label: '&File', items: m.file },
      { label: '&Edit', items: () => [...m.history(), sep, ...m.transfer()] },
      {
        label: '&Game',
        items: () => [...m.sides(), sep, ...m.difficulty(), ...m.timeControl(), sep, ...m.resign()],
      },
      {
        label: '&Actions',
        items: () => [...m.hint(), ...m.moveNow(), ...m.takeBack(), sep, ...m.camera()],
      },
      {
        label: '&Mentor',
        items: () => [
          ...m.marks(),
          sep,
          {
            label: '&Chess Coach',
            action: () => {
              this.coach.panel.setVisible(true);
              this.coach.panel.setCollapsed(false);
            },
          },
          ...m.suggest(),
        ],
      },
      {
        label: '&Preferences',
        items: () => [
          ...m.effects(),
          sep,
          ...m.boardView(),
          ...m.coordinates(),
          sep,
          ...m.appearance(),
          sep,
          ...m.interface(),
          ...m.settings(),
        ],
      },
      {
        label: '&Windows',
        items: () => [
          {
            label: '&Chess Coach',
            checked: () => this.coach.panel.visible,
            action: () => this.coach.panel.setVisible(!this.coach.panel.visible),
          },
          {
            label: '&Game Status',
            checked: () => this.status.panel.visible,
            action: () => this.status.panel.setVisible(!this.status.panel.visible),
          },
          {
            label: 'Ca&ptured Pieces',
            checked: () => this.captured.panel.visible,
            action: () => this.captured.panel.setVisible(!this.captured.panel.visible),
          },
          {
            label: '&Move List',
            checked: () => this.status.moveListVisible,
            action: () => this.status.setMoveListVisible(!this.status.moveListVisible),
          },
          sep,
          { label: '&Full Screen', action: () => this.ctx.commands.toggleFullscreen() },
        ],
      },
      { label: '&Help', items: m.help },
    ];
  }
}
