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

// The interface around the board, laid out like the reference: a title bar with the wordmark and
// window buttons, the menu bar, the Chess Coach on the left, Game Status and Captured Pieces on the
// right, the turn tab and round buttons at the bottom and a status line. It follows the game state
// and sends the player's commands to the app.

import type { App } from '../app/App.ts';
import { DIFFICULTIES, difficulty } from '../engine/difficulty.ts';
import { coachMarks, describeMove, describeResult, type CoachOptions } from '../game/coach.ts';
import type { GameState } from '../game/GameController.ts';
import { TIME_CONTROLS, type Settings } from '../game/Settings.ts';
import type { Color } from '../game/types.ts';
import { BottomBar } from './BottomBar.ts';
import { CapturedPanel } from './CapturedPanel.ts';
import { CoachPanel } from './CoachPanel.ts';
import { dialogOpen } from './Dialog.ts';
import {
  aboutDialog,
  downloadText,
  gameOverDialog,
  importExportDialog,
  newGameDialog,
  settingsDialog,
  shortcutsDialog,
} from './dialogs.ts';
import { GameStatusPanel, type PlayerInfo } from './GameStatusPanel.ts';
import { MenuBar, type Menu, type MenuItem } from './MenuBar.ts';
import type { Panel } from './Panel.ts';

const VERSION = '0.1.0';

export class UiRoot {
  readonly element: HTMLElement;
  private readonly status: GameStatusPanel;
  private readonly captured: CapturedPanel;
  private readonly coach: CoachPanel;
  private readonly bottom: BottomBar;
  private readonly menu: MenuBar;
  private coachOptions: Omit<CoachOptions, 'side'> = {
    captureMoves: false,
    checkMoves: false,
    board: 'off',
    pawns: 'off',
  };
  private seenMoves = 0;
  private seenGeneration = -1;
  private announced = '';
  private lastError: string | null = null;

  constructor(private readonly app: App) {
    this.element = document.createElement('div');
    this.element.className = 'ui';
    // Keep the reference proportions: the layout is designed for a 1024x768 window.
    const scale = () => {
      const factor = Math.min(window.innerWidth / 1024, window.innerHeight / 768);
      document.documentElement.style.setProperty(
        '--ui-scale',
        String(Math.min(1.6, Math.max(0.55, factor))),
      );
    };
    scale();
    window.addEventListener('resize', scale);

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
    winButton('max', 'Full screen', () => this.toggleFullscreen());
    winButton('close', 'Hide all windows', () => this.toggleAllPanels());
    titleBar.append(windowButtons);

    this.menu = new MenuBar(this.menus());
    titleBar.append(this.menu.element);

    this.coach = new CoachPanel({
      onOptions: (options) => {
        this.coachOptions = options;
        this.refreshCoachMarks();
      },
      onShowLegalMoves: (on) => this.app.settings.update({ showLegalMoves: on }),
      onHint: () => this.hint(),
    });
    this.status = new GameStatusPanel({
      first: () => void this.undoAll(),
      back: () => void this.app.controller.undo(),
      pause: () => void this.app.controller.moveNow(),
      forward: () => void this.app.controller.redo(),
      last: () => void this.redoAll(),
    });
    this.captured = new CapturedPanel(() => this.captured.toggleMaterial());
    const right = document.createElement('div');
    right.className = 'right-column';
    right.append(this.status.panel.element, this.captured.panel.element);

    this.bottom = new BottomBar({
      newGame: () => void this.newGame(),
      undo: () => void this.app.controller.undo(),
      redo: () => void this.app.controller.redo(),
      resign: () => void this.resign(),
      hint: () => this.hint(),
      flip: () => void this.app.camera.flip(),
      settings: () => void this.settings(),
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

    // Keep the board clear of the right-hand panels on narrower windows.
    const reserve = () => {
      const open = [this.status.panel, this.captured.panel].some((p) => p.visible && !p.collapsed);
      const width = open && window.innerWidth >= 760 ? right.getBoundingClientRect().width : 0;
      app.camera.setReservedRight(width);
    };
    for (const panel of this.panels()) panel.onChange(reserve);
    window.addEventListener('resize', reserve);
    reserve();

    app.controller.state.subscribe((state) => this.render(state));
    app.settings.subscribe((settings) => {
      this.coach.syncLegalMoves(settings.showLegalMoves);
      this.render(app.controller.state.get());
    });
    setInterval(() => this.renderClocks(), 200);
    window.addEventListener('keydown', (event) => this.onKey(event));
    this.renderClocks();
  }

  private players(state: GameState): Record<Color, PlayerInfo> {
    const level = difficulty(state.difficulty);
    const computer: PlayerInfo = { name: 'Stockfish', rating: level.rating, computer: true };
    if (state.mode === 'local') {
      return { w: { name: 'White', computer: false }, b: { name: 'Black', computer: false } };
    }
    const human: PlayerInfo = { name: 'Player', computer: false };
    return state.humanColor === 'w' ? { w: human, b: computer } : { w: computer, b: human };
  }

  private render(state: GameState): void {
    const bottomColor: Color = this.app.camera.side === 'black' ? 'b' : 'w';
    this.status.render(state, this.players(state), bottomColor);
    this.captured.render(state);
    const over = state.status.kind !== 'playing';
    this.bottom.render(state.turn, over, state.canUndo, state.canRedo, this.statusText(state));
    this.narrate(state);
    this.refreshCoachMarks();
  }

  private statusText(state: GameState): string {
    if (state.phase === 'loading') return 'Loading the pieces and the engine…';
    if (state.status.kind !== 'playing') return describeResult(state.status);
    const side = state.turn === 'w' ? 'White' : 'Black';
    const check = state.inCheck ? ' Check!' : '';
    if (state.phase === 'engineThinking') return `Stockfish is thinking…${check}`;
    if (state.phase === 'awaitingPromotion') return 'Choose a piece for the pawn.';
    if (state.mode === 'computer')
      return `${state.turn === state.humanColor ? 'Your move' : `${side} to move`}.${check}`;
    return `${side} to move.${check}`;
  }

  /** Coach commentary on new moves, results and engine trouble. */
  private narrate(state: GameState): void {
    if (state.history.length < this.seenMoves || state.generation < this.seenGeneration) {
      this.seenMoves = state.history.length;
    }
    this.seenGeneration = state.generation;
    for (let i = this.seenMoves; i < state.history.length; i++) {
      const move = state.history[i]!;
      const who =
        state.mode === 'local'
          ? move.color === 'w'
            ? 'White'
            : 'Black'
          : move.color === state.humanColor
            ? 'You'
            : 'Stockfish';
      const isLast = i === state.history.length - 1;
      this.coach.say(describeMove(move, who, isLast && state.inCheck));
    }
    this.seenMoves = state.history.length;
    const result = describeResult(state.status);
    const key = `${result}|${state.history.length}`;
    if (result && state.phase === 'gameOver' && key !== this.announced) {
      this.announced = key;
      this.coach.say(result);
      void this.showGameOver(state, result);
    }
    if (!result) this.announced = '';
    if (state.engineError && state.engineError !== this.lastError) {
      this.coach.say(`The engine had a problem (${state.engineError}); it restarts by itself.`);
    }
    this.lastError = state.engineError;
  }

  private async showGameOver(state: GameState, result: string): Promise<void> {
    if (dialogOpen()) return;
    const human = state.mode === 'computer' ? state.humanColor : null;
    const status = state.status;
    let headline = 'Game over';
    if (status.kind === 'draw') headline = 'Draw';
    else if (status.kind !== 'playing')
      headline = human
        ? status.winner === human
          ? 'You win!'
          : 'Stockfish wins'
        : `${status.winner === 'w' ? 'White' : 'Black'} wins`;
    const choice = await gameOverDialog(headline, result);
    if (choice === 'new') await this.newGame();
    else if (choice === 'save') downloadText('game.pgn', this.pgn());
  }

  private refreshCoachMarks(): void {
    const state = this.app.controller.state.get();
    const side: Color = state.mode === 'computer' ? state.humanColor : state.turn;
    const marks = coachMarks(this.app.controller.game, { ...this.coachOptions, side });
    this.app.highlights.set({
      spots: marks.spots,
      zones: marks.zones,
      zoneColour: marks.zoneColour,
      pawnMarks: marks.pawns,
    });
  }

  private renderClocks(): void {
    const clock = this.app.controller.clock;
    const timed = clock.limit !== null;
    const times = {
      w: timed ? clock.remaining('w') : clock.elapsed('w'),
      b: timed ? clock.remaining('b') : clock.elapsed('b'),
    };
    this.status.renderClocks(times, clock.active);
  }

  private pgn(): string {
    const state = this.app.controller.state.get();
    const players = this.players(state);
    return this.app.controller.game.toPgn({
      Event: 'Grandmaster 3D game',
      Site: location.host || 'local',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: players.w.rating ? `${players.w.name} (${players.w.rating})` : players.w.name,
      Black: players.b.rating ? `${players.b.name} (${players.b.rating})` : players.b.name,
    });
  }

  // --- commands ------------------------------------------------------------------------------

  private async newGame(): Promise<void> {
    const patch = await newGameDialog(this.app.settings.get());
    if (!patch) return;
    this.coach.clear();
    this.seenMoves = 0;
    await this.app.newGame(patch);
    const state = this.app.controller.state.get();
    this.coach.say(
      state.mode === 'computer'
        ? `New game against Stockfish (${difficulty(state.difficulty).label}). You play ${state.humanColor === 'w' ? 'White' : 'Black'}.`
        : 'New two-player game. White moves first.',
    );
  }

  private async quickNewGame(patch: Partial<Settings>): Promise<void> {
    this.coach.clear();
    this.seenMoves = 0;
    await this.app.newGame(patch);
  }

  private async settings(): Promise<void> {
    const patch = await settingsDialog(this.app.settings.get());
    if (patch) this.app.settings.update(patch);
  }

  private async resign(): Promise<void> {
    if (this.app.controller.state.get().status.kind !== 'playing') return;
    if (!window.confirm('Resign this game?')) return;
    await this.app.controller.resign();
  }

  private hint(): void {
    void this.app.controller.requestHint().then((hint) => {
      if (hint) this.coach.say(`Coach suggests ${hint.from}–${hint.to}.`);
    });
  }

  private async undoAll(): Promise<void> {
    while (this.app.controller.game.canUndo()) await this.app.controller.undo();
  }

  private async redoAll(): Promise<void> {
    while (this.app.controller.game.canRedo()) await this.app.controller.redo();
  }

  private importExport(focusImport = false): void {
    void importExportDialog(
      {
        pgn: this.pgn(),
        fen: this.app.controller.game.fen(),
        load: async (text) => {
          const trimmed = text.trim();
          const looksLikeFen = /^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s+[wb]/.test(trimmed);
          const result = looksLikeFen
            ? await this.app.controller.loadFen(trimmed)
            : await this.app.controller.loadPgn(trimmed);
          if (result.ok) {
            this.coach.clear();
            this.seenMoves = this.app.controller.game.history().length;
            this.coach.say(looksLikeFen ? 'Position loaded.' : 'Game loaded.');
          }
          return result;
        },
      },
      focusImport,
    );
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

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  private onKey(event: KeyboardEvent): void {
    if (dialogOpen() || this.menu.isOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      void this.app.controller.undo();
    } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      void this.app.controller.redo();
    } else if (mod && key === 'n') {
      event.preventDefault();
      void this.newGame();
    } else if (!mod && !event.altKey && !event.shiftKey) {
      if (key === 'h') this.hint();
      else if (key === 'm') void this.app.controller.moveNow();
      else if (key === 'f') void this.app.camera.flip();
    }
  }

  private menus(): Menu[] {
    const app = this.app;
    const s = () => app.settings.get();
    const st = () => app.controller.state.get();
    const toggle = (key: keyof Settings) => () =>
      app.settings.update({ [key]: !s()[key] } as Partial<Settings>);
    const sep: MenuItem = { separator: true };
    return [
      {
        label: '&File',
        items: () => [
          { label: '&New Game…', shortcut: 'Ctrl+N', action: () => void this.newGame() },
          { label: '&Open Game or Position…', action: () => this.importExport(true) },
          { label: '&Save Game (PGN)', action: () => downloadText('game.pgn', this.pgn()) },
          sep,
          {
            label: 'Copy &FEN',
            action: () =>
              void navigator.clipboard?.writeText(app.controller.game.fen()).catch(() => undefined),
          },
          {
            label: 'Copy &PGN',
            action: () => void navigator.clipboard?.writeText(this.pgn()).catch(() => undefined),
          },
        ],
      },
      {
        label: '&Edit',
        items: () => [
          {
            label: '&Undo Move',
            shortcut: 'Ctrl+Z',
            enabled: () => st().canUndo,
            action: () => void app.controller.undo(),
          },
          {
            label: '&Redo Move',
            shortcut: 'Ctrl+Y',
            enabled: () => st().canRedo,
            action: () => void app.controller.redo(),
          },
          sep,
          { label: '&Paste Game or Position…', action: () => this.importExport(true) },
          { label: '&Export…', action: () => this.importExport(false) },
        ],
      },
      {
        label: '&Game',
        items: () => [
          {
            label: 'Play as &White',
            checked: () => s().mode === 'computer' && s().humanColor === 'w',
            action: () => void this.quickNewGame({ mode: 'computer', humanColor: 'w' }),
          },
          {
            label: 'Play as &Black',
            checked: () => s().mode === 'computer' && s().humanColor === 'b',
            action: () => void this.quickNewGame({ mode: 'computer', humanColor: 'b' }),
          },
          {
            label: '&Two Players',
            checked: () => s().mode === 'local',
            action: () => void this.quickNewGame({ mode: 'local' }),
          },
          sep,
          {
            label: '&Difficulty',
            submenu: () =>
              DIFFICULTIES.map((d) => ({
                label: d.label,
                checked: () => s().difficulty === d.id,
                action: () => app.settings.update({ difficulty: d.id }),
              })),
          },
          {
            label: '&Time Control',
            submenu: () =>
              TIME_CONTROLS.map((m) => ({
                label: m === 0 ? 'Untimed' : `${m} Min/Game`,
                checked: () => s().minutes === m,
                action: () => void this.quickNewGame({ minutes: m }),
              })),
          },
          sep,
          {
            label: '&Resign',
            enabled: () => st().status.kind === 'playing',
            action: () => void this.resign(),
          },
        ],
      },
      {
        label: '&Actions',
        items: () => [
          { label: '&Hint', shortcut: 'H', action: () => this.hint() },
          {
            label: '&Move Now',
            shortcut: 'M',
            enabled: () => st().phase === 'engineThinking',
            action: () => void app.controller.moveNow(),
          },
          {
            label: '&Take Back',
            shortcut: 'Ctrl+Z',
            enabled: () => st().canUndo,
            action: () => void app.controller.undo(),
          },
          sep,
          { label: '&Flip Board', shortcut: 'F', action: () => void app.camera.flip() },
          { label: 'Reset &View', shortcut: 'Home', action: () => app.camera.reset() },
        ],
      },
      {
        label: '&Mentor',
        items: () => [
          {
            label: 'Show &Legal Moves',
            checked: () => s().showLegalMoves,
            action: toggle('showLegalMoves'),
          },
          {
            label: 'Show Last &Move',
            checked: () => s().showLastMove,
            action: toggle('showLastMove'),
          },
          sep,
          {
            label: '&Chess Coach',
            action: () => {
              this.coach.panel.setVisible(true);
              this.coach.panel.setCollapsed(false);
            },
          },
          { label: '&Suggest a Move', shortcut: 'H', action: () => this.hint() },
        ],
      },
      {
        label: '&Preferences',
        items: () => [
          { label: '&Sound', checked: () => s().sound, action: toggle('sound') },
          {
            label: '&Animation Speed',
            submenu: () =>
              (
                [
                  [0, 'Instant'],
                  [0.6, 'Fast'],
                  [1, 'Normal'],
                  [1.6, 'Slow'],
                ] as const
              ).map(([v, label]) => ({
                label,
                checked: () => s().animationSpeed === v,
                action: () => app.settings.update({ animationSpeed: v }),
              })),
          },
          {
            label: '&Follow Move Path',
            checked: () => s().followPath,
            action: toggle('followPath'),
          },
          { label: '&Demolish Captures', checked: () => s().demolish, action: toggle('demolish') },
          {
            label: 'Board &Coordinates',
            checked: () => s().showCoordinates,
            action: toggle('showCoordinates'),
          },
          sep,
          { label: 'Se&ttings…', action: () => void this.settings() },
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
          { label: '&Full Screen', action: () => this.toggleFullscreen() },
        ],
      },
      {
        label: '&Help',
        items: () => [
          { label: '&Keyboard and Mouse…', action: () => void shortcutsDialog() },
          { label: '&About Grandmaster 3D…', action: () => void aboutDialog(VERSION) },
        ],
      },
    ];
  }
}
