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

// The contract between UiRoot, which follows the game and runs the player's commands, and a shell:
// one complete interface around the board (its bars, windows and buttons). UiRoot mounts one shell
// at a time and hands it everything it shows and every command it offers.

import type { App } from '../app/App.ts';
import type { CoachOptions } from '../game/coach.ts';
import type { GameState } from '../game/GameController.ts';
import type { Settings } from '../game/Settings.ts';
import type { Color } from '../game/types.ts';
import type { PlayerInfo } from './GameStatusPanel.ts';
import type { MenuItem } from './MenuBar.ts';

/** The Chess Coach's board aids; the side they are for follows the game. */
export type CoachAids = Omit<CoachOptions, 'side'>;

/** What a shell shows for the current position. */
export interface ShellView {
  readonly state: GameState;
  readonly settings: Settings;
  readonly players: Record<Color, PlayerInfo>;
  /** The colour at the bottom of the screen (the side the camera looks from). */
  readonly bottomColor: Color;
  /** One line about the game: whose move it is, check, thinking or the result. */
  readonly status: string;
}

/** The player's commands, the same in every interface. */
export interface Commands {
  newGame(): void;
  undo(): void;
  redo(): void;
  undoAll(): void;
  redoAll(): void;
  moveNow(): void;
  resign(): void;
  hint(): void;
  flip(): void;
  topView(): void;
  settings(): void;
  toggleFullscreen(): void;
}

/** Menu entries grouped by topic; each shell arranges the groups into its own menus. */
export interface MenuCatalog {
  /** New, open and save, and copying the FEN or PGN. */
  readonly file: () => MenuItem[];
  /** Undo Move, Redo Move. */
  readonly history: () => MenuItem[];
  /** Paste a game or position, export. */
  readonly transfer: () => MenuItem[];
  /** Play as White, Play as Black, Two Players. */
  readonly sides: () => MenuItem[];
  readonly difficulty: () => MenuItem[];
  readonly timeControl: () => MenuItem[];
  readonly resign: () => MenuItem[];
  readonly hint: () => MenuItem[];
  readonly moveNow: () => MenuItem[];
  readonly takeBack: () => MenuItem[];
  /** Flip, top view and reset view. */
  readonly camera: () => MenuItem[];
  /** Legal-move and last-move marks. */
  readonly marks: () => MenuItem[];
  readonly suggest: () => MenuItem[];
  /** Sound, animation speed, move path, demolish and glass reflections. */
  readonly effects: () => MenuItem[];
  readonly coordinates: () => MenuItem[];
  /** One-click looks, the Board and Pieces dialog, and the board, piece set and table lists. */
  readonly appearance: () => MenuItem[];
  /** Interface ▸ Modern / Retro. */
  readonly interface: () => MenuItem[];
  readonly settings: () => MenuItem[];
  readonly help: () => MenuItem[];
}

export interface ShellContext {
  readonly app: App;
  readonly commands: Commands;
  readonly menu: MenuCatalog;
  coachAids(): CoachAids;
  setCoachAids(aids: CoachAids): void;
  /** Aborted when the shell is replaced; listeners on window and document must use it. */
  readonly signal: AbortSignal;
}

/** A shell adds its element to app.root when it is built and takes it away in dispose(). */
export interface Shell {
  /** The shell's root, placed over the board. */
  readonly element: HTMLElement;
  /** True while one of its menus is open, so board shortcuts can stand aside. */
  readonly menuOpen: boolean;
  render(view: ShellView): void;
  /** Called a few times a second with each side's remaining (or used) time. */
  renderClocks(times: Record<Color, number>, running: Color | null): void;
  /** Adds a line to the coach's commentary. */
  say(text: string): void;
  clearLog(): void;
  /** Removes the shell's elements; its listeners go with the context's signal. */
  dispose(): void;
}
