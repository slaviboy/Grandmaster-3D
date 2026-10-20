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

// The modern Match card: the opponent at the top and the player at the bottom, as on the board,
// each with a portrait, their colour, the pieces they have taken, the material lead and a clock.
// The move list sits between them with buttons to step back and forth.

import { formatClock } from '../../game/Clock.ts';
import type { GameState } from '../../game/GameController.ts';
import type { Color, PieceKind } from '../../game/types.ts';
import { el } from '../Dialog.ts';
import type { PlayerInfo } from '../GameStatusPanel.ts';
import { LINE_ICONS, pieceSvg } from '../icons.ts';
import { computerPortrait } from '../portraits.ts';
import type { Commands } from '../shell.ts';
import { iconButton } from './controls.ts';

const ORDER: readonly PieceKind[] = ['q', 'r', 'b', 'n', 'p'];
const VALUES: Record<PieceKind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** A running clock shows red below this many milliseconds. */
const LOW_TIME = 30_000;

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

interface Row {
  readonly root: HTMLElement;
  readonly avatar: HTMLElement;
  readonly badge: HTMLElement;
  readonly name: HTMLElement;
  readonly rating: HTMLElement;
  readonly note: HTMLElement;
  readonly captures: HTMLElement;
  readonly lead: HTMLElement;
  readonly clock: HTMLElement;
}

export class MatchCard {
  readonly element: HTMLElement;
  private readonly top: Row;
  private readonly bottom: Row;
  private readonly list: HTMLElement;
  private readonly control: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly nav: Record<'first' | 'back' | 'now' | 'forward' | 'last', HTMLButtonElement>;
  private readonly listeners = new Set<() => void>();
  private bottomColor: Color = 'w';
  private timed = false;
  private portraits = '';
  /** The moves last drawn; null until the first render, so an empty game shows its hint. */
  private renderedMoves: string | null = null;

  constructor(commands: Commands) {
    this.element = el('aside', 'm-card m-match');
    this.element.id = 'match-card';
    this.element.setAttribute('aria-label', 'Match');
    this.top = this.row('top');
    this.bottom = this.row('bottom');

    const moves = el('div', 'm-match-moves');
    const head = el('div', 'm-match-head');
    this.control = el('span', 'm-time-control');
    this.toggle = iconButton(LINE_ICONS.chevronDown, 'Hide the moves', () =>
      this.setMovesVisible(!this.movesVisible),
    );
    this.toggle.classList.add('m-fold');
    head.append(el('span', 'm-label', 'Moves'), this.control, this.toggle);
    this.list = el('ol', 'm-moves');
    this.list.setAttribute('aria-label', 'Moves');
    const nav = el('div', 'm-move-nav');
    this.nav = {
      first: iconButton(LINE_ICONS.first, 'Take back all moves', () => commands.undoAll()),
      back: iconButton(LINE_ICONS.prev, 'Take back a move', () => commands.undo()),
      now: iconButton(LINE_ICONS.moveNow, 'Move now', () => commands.moveNow()),
      forward: iconButton(LINE_ICONS.next, 'Replay a move', () => commands.redo()),
      last: iconButton(LINE_ICONS.last, 'Replay all moves', () => commands.redoAll()),
    };
    nav.append(...Object.values(this.nav));
    moves.append(head, this.list, nav);
    this.element.append(this.top.root, moves, this.bottom.root);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    this.notify();
  }

  get movesVisible(): boolean {
    return !this.element.classList.contains('compact');
  }

  setMovesVisible(visible: boolean): void {
    this.element.classList.toggle('compact', !visible);
    const label = visible ? 'Hide the moves' : 'Show the moves';
    this.toggle.setAttribute('aria-label', label);
    this.toggle.dataset.tip = label;
    this.toggle.setAttribute('aria-expanded', String(visible));
    if (visible) this.list.scrollTop = this.list.scrollHeight;
    this.notify();
  }

  /** Called when the card is shown, hidden, folded or unfolded. */
  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  render(state: GameState, players: Record<Color, PlayerInfo>, bottomColor: Color): void {
    this.bottomColor = bottomColor;
    this.timed = state.minutes > 0;
    this.control.textContent = this.timed ? `${state.minutes} min` : 'Untimed';
    const playing = state.status.kind === 'playing';
    const material = (color: Color) =>
      state.captured[other(color)].reduce((sum, kind) => sum + VALUES[kind], 0);
    const look = (p: PlayerInfo) => `${p.computer}:${p.portrait?.src ?? ''}`;
    const portraitsKey = `${bottomColor}|${look(players.w)}|${look(players.b)}`;
    for (const [row, color] of [
      [this.top, other(bottomColor)],
      [this.bottom, bottomColor],
    ] as const) {
      const info = players[color];
      row.root.dataset.color = color;
      row.root.classList.toggle('to-move', playing && state.turn === color);
      row.name.textContent = info.name;
      row.rating.textContent = info.rating ? String(info.rating) : '';
      row.rating.hidden = !info.rating;
      const thinking = info.computer && state.phase === 'engineThinking';
      row.note.textContent = thinking
        ? state.thinking && state.thinking.depth > 0
          ? `Thinking ${state.thinking.score}`
          : 'Thinking'
        : '';
      row.note.hidden = !thinking;
      this.renderCaptures(row, state.captured[other(color)], other(color));
      const lead = material(color) - material(other(color));
      row.lead.textContent = lead > 0 ? `+${lead}` : '';
      row.badge.dataset.color = color;
      row.badge.title = color === 'w' ? 'Plays White' : 'Plays Black';
      if (portraitsKey !== this.portraits) this.renderAvatar(row, info, color);
    }
    this.portraits = portraitsKey;
    this.nav.first.disabled = !state.canUndo;
    this.nav.back.disabled = !state.canUndo;
    this.nav.forward.disabled = !state.canRedo;
    this.nav.last.disabled = !state.canRedo;
    this.nav.now.disabled = state.phase !== 'engineThinking';
    this.renderMoves(state);
  }

  renderClocks(times: Record<Color, number>, running: Color | null): void {
    for (const [row, color] of [
      [this.top, other(this.bottomColor)],
      [this.bottom, this.bottomColor],
    ] as const) {
      row.clock.textContent = formatClock(times[color]);
      const active = running === color;
      row.clock.classList.toggle('active', active);
      row.clock.classList.toggle('low', active && this.timed && times[color] < LOW_TIME);
    }
  }

  private row(position: 'top' | 'bottom'): Row {
    const root = el('div', `m-player ${position}`);
    root.innerHTML = `<div class="m-avatar"><div class="m-avatar-img"></div><span class="m-avatar-color"></span></div><div class="m-player-name"><span class="m-name"></span></div><div class="m-clock" role="timer"></div><div class="m-player-sub"><span class="m-rating"></span><span class="m-note" aria-live="polite"></span><span class="m-captures"></span><span class="m-lead"></span></div>`;
    const q = (s: string) => root.querySelector<HTMLElement>(s)!;
    return {
      root,
      avatar: q('.m-avatar-img'),
      badge: q('.m-avatar-color'),
      name: q('.m-name'),
      rating: q('.m-rating'),
      note: q('.m-note'),
      captures: q('.m-captures'),
      lead: q('.m-lead'),
      clock: q('.m-clock'),
    };
  }

  /** The computer's portrait, or for a person a pawn of their colour. */
  private renderAvatar(row: Row, info: PlayerInfo, color: Color): void {
    row.avatar.classList.toggle('person', !info.portrait);
    if (info.portrait) {
      const image = el('img');
      image.src = info.portrait.src;
      image.alt = info.portrait.alt;
      image.addEventListener(
        'error',
        () => (row.avatar.innerHTML = computerPortrait(`m-portrait-${color}`)),
        { once: true },
      );
      row.avatar.replaceChildren(image);
    } else {
      row.avatar.innerHTML = pieceSvg(color, 'p', 30);
    }
  }

  /** The pieces this side has taken, grouped by kind, strongest first. */
  private renderCaptures(row: Row, taken: readonly PieceKind[], color: Color): void {
    const key = `${color}:${[...taken].sort().join('')}`;
    if (row.captures.dataset.key === key) return;
    row.captures.dataset.key = key;
    row.captures.replaceChildren();
    for (const kind of ORDER) {
      const n = taken.filter((k) => k === kind).length;
      if (n === 0) continue;
      const group = el('span', 'm-cap-group');
      group.dataset.color = color;
      group.innerHTML = pieceSvg(color, kind, 16).repeat(n);
      row.captures.append(group);
    }
    row.captures.setAttribute(
      'aria-label',
      taken.length ? `${taken.length} pieces taken` : 'No pieces taken',
    );
  }

  private renderMoves(state: GameState): void {
    const key = state.history.map((m) => m.san).join(' ');
    if (key === this.renderedMoves) return;
    this.renderedMoves = key;
    this.list.replaceChildren();
    if (state.history.length === 0) {
      this.list.append(el('li', 'm-moves-empty', 'No moves yet'));
      return;
    }
    const startsWithBlack = state.history[0]?.color === 'b';
    const moves = startsWithBlack ? [null, ...state.history] : [...state.history];
    for (let i = 0; i < moves.length; i += 2) {
      const row = el('li');
      row.append(el('span', 'm-move-number', `${i / 2 + 1}.`));
      for (const move of [moves[i], moves[i + 1]]) {
        row.append(el('span', 'm-move-san', move ? move.san : move === null ? '…' : ''));
      }
      this.list.append(row);
    }
    const cells = [...this.list.querySelectorAll('.m-move-san')];
    cells
      .filter((c) => c.textContent && c.textContent !== '…')
      .at(-1)
      ?.classList.add('current');
    this.list.scrollTop = this.list.scrollHeight;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
