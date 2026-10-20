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

// The interface's brain: it follows the game state, narrates moves in the coach, keeps the board
// marks and clocks current, runs the player's commands and keyboard shortcuts, and mounts the shell
// that draws the interface around the board.

import type { App } from '../app/App.ts';
import { DIFFICULTIES, difficulty } from '../engine/difficulty.ts';
import { coachMarks, describeMove, describeResult } from '../game/coach.ts';
import type { GameState } from '../game/GameController.ts';
import { TIME_CONTROLS, type Settings, type UiStyle } from '../game/Settings.ts';
import type { Color } from '../game/types.ts';
import { dialogOpen } from './Dialog.ts';
import {
  aboutDialog,
  confirmDialog,
  downloadText,
  gameOverDialog,
  importExportDialog,
  newGameDialog,
  ratingDialog,
  settingsDialog,
  shortcutsDialog,
} from './dialogs.ts';
import { opponentPortrait } from './portraits.ts';
import type { PlayerInfo } from './GameStatusPanel.ts';
import { themeDialog } from './ThemeDialog.ts';
import {
  BOARD_THEMES,
  CUSTOM_ID,
  LOOKS,
  PIECE_THEMES,
  TABLE_THEMES,
  currentLook,
} from '../scene/themes.ts';
import type { MenuItem } from './MenuBar.ts';
import { ModernShell } from './modern/ModernShell.ts';
import { newGameSheet } from './modern/newGameSheet.ts';
import { RetroShell } from './RetroShell.ts';
import type { CoachAids, Commands, MenuCatalog, Shell } from './shell.ts';

const VERSION = '0.1.0';

export class UiRoot {
  private shell: Shell | null = null;
  private style: UiStyle | null = null;
  /** Aborted when the mounted shell is replaced, taking its listeners with it. */
  private mounted: AbortController | null = null;
  /** The coach's recent lines, so a newly mounted shell carries on the same commentary. */
  private readonly log: string[] = [];
  private readonly menu: MenuCatalog;
  private coachOptions: CoachAids = {
    captureMoves: false,
    checkMoves: false,
    board: 'off',
    pawns: 'off',
  };
  /** The colour at the bottom of the screen when the shell was last drawn. */
  private shownSide: Color | null = null;
  private seenMoves = 0;
  private seenGeneration = -1;
  private announced = '';
  private lastError: string | null = null;
  private readonly commands: Commands = {
    newGame: () => void this.newGame(),
    undo: () => void this.app.controller.undo(),
    redo: () => void this.app.controller.redo(),
    undoAll: () => void this.undoAll(),
    redoAll: () => void this.redoAll(),
    moveNow: () => void this.app.controller.moveNow(),
    resign: () => void this.resign(),
    hint: () => this.hint(),
    flip: () => void this.app.camera.flip(),
    topView: () => this.app.camera.topView(),
    settings: () => void this.settings(),
    toggleFullscreen: () => this.toggleFullscreen(),
  };

  constructor(private readonly app: App) {
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

    this.menu = this.catalog();
    this.mount(app.settings.get().uiStyle);
    this.app.onNotice((text) => this.say(text));

    app.controller.state.subscribe((state) => this.render(state));
    app.settings.subscribe((settings) => {
      if (settings.uiStyle !== this.style) this.mount(settings.uiStyle);
      this.render(app.controller.state.get());
    });
    setInterval(() => this.renderClocks(), 200);
    window.addEventListener('keydown', (event) => this.onKey(event));
    this.renderClocks();
  }

  /** Puts up the interface in the given style, replacing the current one. */
  private mount(style: UiStyle): void {
    this.shell?.dispose();
    this.mounted?.abort();
    this.mounted = new AbortController();
    this.style = style;
    // The interface styles apply under html[data-ui].
    document.documentElement.dataset.ui = style;
    const context = {
      app: this.app,
      commands: this.commands,
      menu: this.menu,
      coachAids: () => this.coachOptions,
      setCoachAids: (aids: CoachAids) => {
        this.coachOptions = aids;
        this.refreshCoachMarks();
      },
      signal: this.mounted.signal,
    };
    const shell = style === 'modern' ? new ModernShell(context) : new RetroShell(context);
    for (const line of this.log) shell.say(line);
    this.shell = shell;
    this.renderClocks();
  }

  private say(text: string): void {
    if (!text) return;
    this.log.push(text);
    if (this.log.length > 40) this.log.shift();
    this.shell?.say(text);
  }

  private clearLog(): void {
    this.log.length = 0;
    this.shell?.clearLog();
  }

  private players(state: GameState): Record<Color, PlayerInfo> {
    const computer: PlayerInfo = {
      name: 'Stockfish',
      rating: state.rating,
      computer: true,
      portrait: opponentPortrait(state.difficulty, state.rating),
    };
    if (state.mode === 'local') {
      return { w: { name: 'White', computer: false }, b: { name: 'Black', computer: false } };
    }
    const human: PlayerInfo = { name: 'Player', computer: false };
    return state.humanColor === 'w' ? { w: human, b: computer } : { w: computer, b: human };
  }

  private render(state: GameState): void {
    this.shownSide = this.app.camera.side === 'black' ? 'b' : 'w';
    this.shell?.render({
      state,
      settings: this.app.settings.get(),
      players: this.players(state),
      bottomColor: this.shownSide,
      status: this.statusText(state),
    });
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
      this.say(describeMove(move, who, isLast && state.inCheck));
    }
    this.seenMoves = state.history.length;
    const result = describeResult(state.status);
    const key = `${result}|${state.history.length}`;
    if (result && state.phase === 'gameOver' && key !== this.announced) {
      this.announced = key;
      this.say(result);
      void this.showGameOver(state, result);
    }
    if (!result) this.announced = '';
    if (state.engineError && state.engineError !== this.lastError) {
      this.say(`The engine had a problem (${state.engineError}); it restarts by itself.`);
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
    // The players' cards follow the board when it turns (a flip, or taking Black) without a move.
    const side: Color = this.app.camera.side === 'black' ? 'b' : 'w';
    if (this.shownSide !== null && side !== this.shownSide) {
      this.render(this.app.controller.state.get());
    }
    const clock = this.app.controller.clock;
    const timed = clock.limit !== null;
    const times = {
      w: timed ? clock.remaining('w') : clock.elapsed('w'),
      b: timed ? clock.remaining('b') : clock.elapsed('b'),
    };
    this.shell?.renderClocks(times, clock.active);
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
    const ask = this.style === 'modern' ? newGameSheet : newGameDialog;
    const patch = await ask(this.app.settings.get());
    if (!patch) return;
    this.clearLog();
    this.seenMoves = 0;
    await this.app.newGame(patch);
    const state = this.app.controller.state.get();
    this.say(
      state.mode === 'computer'
        ? `New game against Stockfish (${state.difficulty === 'custom' ? `rated ${state.rating}` : difficulty(state.difficulty).label}). You play ${state.humanColor === 'w' ? 'White' : 'Black'}.`
        : 'New two-player game. White moves first.',
    );
  }

  private async quickNewGame(patch: Partial<Settings>): Promise<void> {
    this.clearLog();
    this.seenMoves = 0;
    await this.app.newGame(patch);
  }

  private async settings(): Promise<void> {
    const patch = await settingsDialog(this.app.settings.get());
    if (patch === 'themes') await themeDialog(this.app.settings);
    else if (patch) this.app.settings.update(patch);
  }

  private async resign(): Promise<void> {
    const state = this.app.controller.state.get();
    if (state.status.kind !== 'playing') return;
    const ok =
      this.style === 'modern'
        ? await confirmDialog('Resign this game?', this.resignation(state), 'Resign')
        : window.confirm('Resign this game?');
    if (!ok) return;
    await this.app.controller.resign();
  }

  /** Who gives up and who wins: the player against the computer, else the side to move. */
  private resignation(state: GameState): string {
    if (state.mode === 'computer') return 'Stockfish wins the game.';
    const loser = state.turn === 'w' ? 'White' : 'Black';
    const winner = state.turn === 'w' ? 'Black' : 'White';
    return `${loser} gives up and ${winner} wins the game.`;
  }

  private hint(): void {
    void this.app.controller.requestHint().then((hint) => {
      if (hint) this.say(`Coach suggests ${hint.from}–${hint.to}.`);
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
            this.clearLog();
            this.seenMoves = this.app.controller.game.history().length;
            this.say(looksLikeFen ? 'Position loaded.' : 'Game loaded.');
          }
          return result;
        },
      },
      focusImport,
    );
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  private onKey(event: KeyboardEvent): void {
    if (dialogOpen() || this.shell?.menuOpen) return;
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
      else if (key === 't') this.app.camera.topView();
    }
  }

  /** Every menu entry, grouped by topic for the shells to arrange. */
  private catalog(): MenuCatalog {
    const app = this.app;
    const s = () => app.settings.get();
    const st = () => app.controller.state.get();
    const toggle = (key: keyof Settings) => () =>
      app.settings.update({ [key]: !s()[key] } as Partial<Settings>);
    const sep: MenuItem = { separator: true };
    return {
      file: () => [
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
      history: () => [
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
      ],
      transfer: () => [
        { label: '&Paste Game or Position…', action: () => this.importExport(true) },
        { label: '&Export…', action: () => this.importExport(false) },
      ],
      sides: () => [
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
      ],
      difficulty: () => [
        {
          label: '&Difficulty',
          submenu: () => [
            ...DIFFICULTIES.map((d) => ({
              label: d.label,
              checked: () => s().difficulty === d.id,
              action: () => app.settings.update({ difficulty: d.id }),
            })),
            {
              label: `Custom (${s().customRating})…`,
              checked: () => s().difficulty === 'custom',
              action: () =>
                void ratingDialog(s().customRating).then((rating) => {
                  if (rating !== null)
                    app.settings.update({ difficulty: 'custom', customRating: rating });
                }),
            },
          ],
        },
      ],
      timeControl: () => [
        {
          label: '&Time Control',
          submenu: () =>
            TIME_CONTROLS.map((m) => ({
              label: m === 0 ? 'Untimed' : `${m} Min/Game`,
              checked: () => s().minutes === m,
              action: () => void this.quickNewGame({ minutes: m }),
            })),
        },
      ],
      resign: () => [
        {
          label: '&Resign',
          enabled: () => st().status.kind === 'playing',
          action: () => void this.resign(),
        },
      ],
      hint: () => [{ label: '&Hint', shortcut: 'H', action: () => this.hint() }],
      moveNow: () => [
        {
          label: '&Move Now',
          shortcut: 'M',
          enabled: () => st().phase === 'engineThinking',
          action: () => void app.controller.moveNow(),
        },
      ],
      takeBack: () => [
        {
          label: '&Take Back',
          shortcut: 'Ctrl+Z',
          enabled: () => st().canUndo,
          action: () => void app.controller.undo(),
        },
      ],
      camera: () => [
        { label: '&Flip Board', shortcut: 'F', action: () => void app.camera.flip() },
        {
          label: 'T&op View',
          shortcut: 'T',
          checked: () => app.camera.isTopView,
          action: () => app.camera.topView(),
        },
        { label: 'Reset &View', shortcut: 'Home', action: () => app.camera.reset() },
      ],
      marks: () => [
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
      ],
      suggest: () => [{ label: '&Suggest a Move', shortcut: 'H', action: () => this.hint() }],
      effects: () => [
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
          label: 'Glass &Reflections',
          checked: () => s().glassReflections,
          action: toggle('glassReflections'),
        },
      ],
      coordinates: () => [
        {
          label: 'Board &Coordinates',
          checked: () => s().showCoordinates,
          action: toggle('showCoordinates'),
        },
      ],
      appearance: () => [
        {
          label: '&Looks',
          submenu: () =>
            LOOKS.map((look) => ({
              label: look.label,
              checked: () => currentLook(s())?.id === look.id,
              action: () =>
                app.settings.update({
                  boardTheme: look.board,
                  pieceTheme: look.pieces,
                  tableTheme: look.table,
                }),
            })),
        },
        { label: 'Board and &Pieces…', action: () => void themeDialog(app.settings) },
        {
          label: '&Board',
          submenu: () => [
            ...BOARD_THEMES.map((t) => ({
              label: t.label,
              checked: () => s().boardTheme === t.id,
              action: () => app.settings.update({ boardTheme: t.id }),
            })),
            {
              label: 'Custom…',
              checked: () => s().boardTheme === CUSTOM_ID,
              action: () => void themeDialog(app.settings, 'board'),
            },
          ],
        },
        {
          label: 'Piece &Set',
          submenu: () => [
            ...PIECE_THEMES.map((t) => ({
              label: t.label,
              checked: () => s().pieceTheme === t.id,
              action: () => app.settings.update({ pieceTheme: t.id }),
            })),
            {
              label: 'Custom…',
              checked: () => s().pieceTheme === CUSTOM_ID,
              action: () => void themeDialog(app.settings, 'pieces'),
            },
          ],
        },
        {
          label: 'T&able',
          submenu: () => [
            ...TABLE_THEMES.map((t) => ({
              label: t.label,
              checked: () => s().tableTheme === t.id,
              action: () => app.settings.update({ tableTheme: t.id }),
            })),
            {
              label: 'Custom…',
              checked: () => s().tableTheme === CUSTOM_ID,
              action: () => void themeDialog(app.settings, 'table'),
            },
          ],
        },
      ],
      settings: () => [{ label: 'Se&ttings…', action: () => void this.settings() }],
      help: () => [
        { label: '&Keyboard and Mouse…', action: () => void shortcutsDialog() },
        { label: '&About Grandmaster 3D…', action: () => void aboutDialog(VERSION) },
      ],
    };
  }
}
