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

// The game's dialogs: New Game, Settings, Import/Export, Game Over, Keyboard & Mouse and About.

import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty.ts';
import type { LoadResult } from '../game/ChessGame.ts';
import { TIME_CONTROLS, type Settings } from '../game/Settings.ts';
import { el, openDialog } from './Dialog.ts';

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label), control);
  return wrap;
}

function select<T extends string | number>(
  options: ReadonlyArray<[T, string]>,
  value: T,
): HTMLSelectElement {
  const node = el('select');
  for (const [v, label] of options) {
    const option = el('option', '', label);
    option.value = String(v);
    option.selected = v === value;
    node.append(option);
  }
  return node;
}

function checkbox(label: string, checked: boolean): [HTMLElement, HTMLInputElement] {
  const row = el('label', 'check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  row.append(input, document.createTextNode(label));
  return [row, input];
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = el('button', 'btn', label);
  node.type = 'button';
  if (primary) node.setAttribute('autofocus', '');
  node.addEventListener('click', onClick);
  return node;
}

const timeLabel = (m: number) => (m === 0 ? 'Untimed' : `${m} minutes per player`);

export function newGameDialog(current: Settings): Promise<Partial<Settings> | null> {
  return openDialog<Partial<Settings> | null>('New Game', null, ({ body, close }) => {
    const mode = select<Settings['mode']>(
      [
        ['computer', 'Against the computer'],
        ['local', 'Two players on this device'],
      ],
      current.mode,
    );
    const side = select<'w' | 'b' | 'random'>(
      [
        ['w', 'White'],
        ['b', 'Black'],
        ['random', 'Random'],
      ],
      current.humanColor,
    );
    const level = select<DifficultyId>(
      DIFFICULTIES.map((d) => [d.id, `${d.label} (about ${d.rating})`]),
      current.difficulty,
    );
    const time = select<number>(
      TIME_CONTROLS.map((m) => [m, timeLabel(m)]),
      current.minutes,
    );
    const sideField = field('You play', side);
    const levelField = field('Difficulty', level);
    const update = () => {
      const local = mode.value === 'local';
      sideField.hidden = local;
      levelField.hidden = local;
    };
    mode.addEventListener('change', update);
    update();
    const actions = el('div', 'dialog-actions');
    actions.append(
      button(
        'Start Game',
        () => {
          const chosen =
            side.value === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (side.value as 'w' | 'b');
          close({
            mode: mode.value as Settings['mode'],
            humanColor: chosen,
            difficulty: level.value as DifficultyId,
            minutes: Number(time.value),
          });
        },
        true,
      ),
      button('Cancel', () => close(null)),
    );
    body.append(
      field('Opponent', mode),
      sideField,
      levelField,
      field('Time control', time),
      actions,
    );
  });
}

/** The Settings dialog; resolves with the changes, null on cancel, or 'themes' to open the looks. */
export function settingsDialog(current: Settings): Promise<Partial<Settings> | null | 'themes'> {
  return openDialog<Partial<Settings> | null | 'themes'>('Settings', null, ({ body, close }) => {
    const [soundRow, sound] = checkbox('Sound effects', current.sound);
    const speed = select<number>(
      [
        [0, 'Instant'],
        [0.6, 'Fast'],
        [1, 'Normal'],
        [1.6, 'Slow'],
      ],
      current.animationSpeed,
    );
    const [pathRow, path] = checkbox(
      'Follow move path (the knight moves in an L)',
      current.followPath,
    );
    const [demolishRow, demolish] = checkbox(
      'Demolish captures (pieces shatter)',
      current.demolish,
    );
    const [glassRow, glass] = checkbox(
      'Glass reflections (turn off if glass looks are slow)',
      current.glassReflections,
    );
    const [legalRow, legal] = checkbox('Show legal moves', current.showLegalMoves);
    const [lastRow, last] = checkbox('Show last move', current.showLastMove);
    const [coordsRow, coords] = checkbox('Show board coordinates', current.showCoordinates);
    const actions = el('div', 'dialog-actions');
    actions.append(
      button(
        'OK',
        () =>
          close({
            sound: sound.checked,
            animationSpeed: Number(speed.value),
            followPath: path.checked,
            demolish: demolish.checked,
            glassReflections: glass.checked,
            showLegalMoves: legal.checked,
            showLastMove: last.checked,
            showCoordinates: coords.checked,
          }),
        true,
      ),
      button('Cancel', () => close(null)),
    );
    const animations = el('div', 'settings-group');
    animations.append(
      el('div', 'coach-heading', 'Animation'),
      field('Speed', speed),
      pathRow,
      demolishRow,
    );
    const board = el('div', 'settings-group');
    board.append(el('div', 'coach-heading', 'Board'), legalRow, lastRow, coordsRow, glassRow);
    board.append(button('Board, pieces and table colours…', () => close('themes')));
    const audio = el('div', 'settings-group');
    audio.append(el('div', 'coach-heading', 'Sound'), soundRow);
    body.append(animations, board, audio, actions);
  });
}

export interface ImportExportActions {
  readonly pgn: string;
  readonly fen: string;
  load(text: string): Promise<LoadResult>;
}

export function importExportDialog(
  actions: ImportExportActions,
  focusImport = false,
): Promise<void> {
  return openDialog<void>('Game and Position', undefined, ({ body, close }) => {
    const fen = el('input');
    fen.type = 'text';
    fen.readOnly = true;
    fen.value = actions.fen;
    const text = el('textarea');
    text.value = focusImport ? '' : actions.pgn;
    text.placeholder = 'Paste a PGN game or a FEN position here, then press Load.';
    text.spellcheck = false;
    if (focusImport) text.setAttribute('autofocus', '');
    const error = el('div', 'form-error');
    error.setAttribute('role', 'alert');
    const file = el('input');
    file.type = 'file';
    file.accept = '.pgn,.fen,.txt';
    file.hidden = true;
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (chosen) text.value = await chosen.text();
    });
    const row = el('div', 'choice-row');
    row.append(
      button('Load', async () => {
        const result = await actions.load(text.value);
        if (result.ok) close();
        else error.textContent = result.error;
      }),
      button('Open File…', () => file.click()),
      button(
        'Copy',
        () => void navigator.clipboard?.writeText(text.value || actions.pgn).catch(() => undefined),
      ),
      button('Save PGN', () => downloadText('game.pgn', actions.pgn)),
    );
    body.append(field('Current position (FEN)', fen), field('Game (PGN)', text), error, row, file);
  });
}

export function downloadText(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/x-chess-pgn' }));
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type GameOverChoice = 'new' | 'review' | 'save';

export function gameOverDialog(message: string, detail: string): Promise<GameOverChoice> {
  return openDialog<GameOverChoice>('Game Over', 'review', ({ body, close }) => {
    const text = el('div', 'game-over-text');
    text.append(el('strong', '', message), el('p', '', detail));
    const actions = el('div', 'dialog-actions');
    actions.append(
      button('New Game', () => close('new'), true),
      button('Review the Board', () => close('review')),
      button('Save Game (PGN)', () => close('save')),
    );
    body.append(text, actions);
  });
}

export function shortcutsDialog(): Promise<void> {
  return openDialog<void>('Keyboard and Mouse', undefined, ({ body }) => {
    const rows: Array<[string, string]> = [
      ['Click a piece, then a square', 'Move'],
      ['Drag a piece', 'Move'],
      ['Drag a board corner', 'Rotate and tilt the board'],
      ['Drag a board edge', 'Pan the board'],
      ['Right-drag anywhere', 'Rotate and tilt'],
      ['Mouse wheel, PgUp / PgDn', 'Zoom'],
      ['← →', 'Rotate the board'],
      ['↑ ↓', 'Tilt the board'],
      ['Home', 'Reset the view'],
      ['Shift + arrows, Enter', 'Move with the keyboard'],
      ['Esc', 'Cancel the selection'],
      ['Ctrl+Z / Ctrl+Y', 'Take back / replay'],
      ['Ctrl+N', 'New game'],
      ['H', 'Hint'],
      ['M', 'Make the computer move now'],
      ['F', 'Flip the board'],
      ['Two fingers', 'Twist to rotate, pinch to zoom, drag to pan'],
    ];
    const table = el('table', 'shortcuts');
    for (const [keys, action] of rows) {
      const tr = el('tr');
      tr.append(el('td', '', keys), el('td', '', action));
      table.append(tr);
    }
    body.append(table);
  });
}

export function aboutDialog(version: string): Promise<void> {
  return openDialog<void>('About Grandmaster 3D', undefined, ({ body }) => {
    body.innerHTML = `
      <p><strong>Grandmaster 3D</strong> ${version}<br>A 3D chess game for the browser.</p>
      <p>Copyright © 2026 Stanislav Georgiev. Free software under the
      <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GNU General Public License v3 or later</a>.</p>
      <p><strong>Built with</strong></p>
      <ul class="credits">
        <li><a href="https://stockfishchess.org/" target="_blank" rel="noopener">Stockfish</a> 19 chess engine, GPL-3.0,
          as the <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">Stockfish.js</a> WebAssembly build
          (source: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">official-stockfish/Stockfish</a>).</li>
        <li><a href="https://threejs.org/" target="_blank" rel="noopener">three.js</a>, MIT License.</li>
        <li><a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noopener">chess.js</a>, BSD 2-Clause License.</li>
        <li>Chess pieces modelled in <a href="https://www.blender.org/" target="_blank" rel="noopener">Blender</a> for this project; board, textures, icons and sounds are original.</li>
      </ul>
      <p class="fine">The look is inspired by classic 2000s desktop chess games. No artwork, models or code from any commercial game are used.</p>`;
  });
}
