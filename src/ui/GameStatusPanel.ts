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

// The Game Status window: a card per player (portrait, king icon in the player's colour, name,
// large clock, time control) with the move list between them, as in the reference layout. The
// player whose clock runs gets the white box around it.

import { formatClock } from '../game/Clock.ts';
import type { GameState } from '../game/GameController.ts';
import type { Color } from '../game/types.ts';
import { pieceSvg } from './icons.ts';
import { Panel } from './Panel.ts';
import { computerPortrait, humanPortrait } from './portraits.ts';

export interface PlayerInfo {
  readonly name: string;
  readonly rating?: number;
  readonly computer: boolean;
  /** A picture for the card; without one a computer gets the carved king, a person a silhouette. */
  readonly portrait?: { readonly src: string; readonly alt: string };
}

export interface MoveListActions {
  first(): void;
  back(): void;
  pause(): void;
  forward(): void;
  last(): void;
}

interface Card {
  readonly root: HTMLElement;
  readonly portrait: HTMLElement;
  readonly icon: HTMLElement;
  readonly name: HTMLElement;
  readonly clock: HTMLElement;
  readonly control: HTMLElement;
  readonly note: HTMLElement;
}

export class GameStatusPanel {
  readonly panel: Panel;
  private readonly top: Card;
  private readonly bottom: Card;
  private readonly list: HTMLElement;
  private readonly nav: HTMLElement;
  private renderedMoves = '';
  private bottomColor: Color = 'w';
  private portraits = '';

  constructor(actions: MoveListActions) {
    this.panel = new Panel({ id: 'game-status', title: 'Game Status' });
    this.top = this.card('top');
    this.bottom = this.card('bottom');
    const nav = document.createElement('div');
    nav.className = 'move-nav';
    const buttons: Array<[string, string, () => void]> = [
      ['⏮', 'Take back all moves', actions.first],
      ['◀', 'Take back a move', actions.back],
      ['■', 'Move now', actions.pause],
      ['▶', 'Replay a move', actions.forward],
      ['⏭', 'Replay all moves', actions.last],
    ];
    for (const [glyph, title, onClick] of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = glyph;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.addEventListener('click', onClick);
      nav.append(button);
    }
    this.list = document.createElement('ol');
    this.list.className = 'move-list';
    this.list.setAttribute('aria-label', 'Moves');
    this.nav = nav;
    // Hidden at first, as in the reference; the turn tab's arrow shows it.
    this.setMoveListVisible(false);
    this.panel.body.append(this.top.root, nav, this.list, this.bottom.root);
  }

  get moveListVisible(): boolean {
    return !this.list.hidden;
  }

  setMoveListVisible(visible: boolean): void {
    this.list.hidden = !visible;
    this.nav.hidden = !visible;
    if (visible) this.list.scrollTop = this.list.scrollHeight;
  }

  private card(position: 'top' | 'bottom'): Card {
    const root = document.createElement('div');
    root.className = `player-card ${position}`;
    root.innerHTML = `<div class="portrait"></div><div class="player-info"><div class="player-line"><span class="king-icon"></span><span class="player-name"></span></div><div class="clock"></div><div class="time-control"></div><div class="player-note" aria-live="polite"></div></div>`;
    const q = (s: string) => root.querySelector<HTMLElement>(s)!;
    return {
      root,
      portrait: q('.portrait'),
      icon: q('.king-icon'),
      name: q('.player-name'),
      clock: q('.clock'),
      control: q('.time-control'),
      note: q('.player-note'),
    };
  }

  /** Updates names, colours, turn and moves from the game state. */
  render(state: GameState, players: Record<Color, PlayerInfo>, bottomColor: Color): void {
    this.bottomColor = bottomColor;
    const topColor: Color = bottomColor === 'w' ? 'b' : 'w';
    const look = (p: PlayerInfo) => `${p.computer}:${p.portrait?.src ?? ''}`;
    const portraitsKey = `${bottomColor}|${look(players.w)}|${look(players.b)}`;
    for (const [card, color] of [
      [this.top, topColor],
      [this.bottom, bottomColor],
    ] as const) {
      const info = players[color];
      card.icon.innerHTML = pieceSvg(color, 'k', 22);
      card.name.textContent = info.rating ? `${info.name} (${info.rating})` : info.name;
      card.control.textContent = state.minutes > 0 ? `${state.minutes} Min/Game` : 'Untimed';
      const thinking = info.computer && state.phase === 'engineThinking';
      card.note.textContent = thinking
        ? state.thinking && state.thinking.depth > 0
          ? `Thinking… ${state.thinking.score}`
          : 'Thinking…'
        : '';
      card.root.classList.toggle(
        'to-move',
        state.turn === color && state.status.kind === 'playing',
      );
      if (portraitsKey !== this.portraits) {
        const fallback = info.computer
          ? computerPortrait(`portrait-${color}`)
          : humanPortrait(`portrait-${color}`);
        if (info.portrait) {
          const image = document.createElement('img');
          image.src = info.portrait.src;
          image.alt = info.portrait.alt;
          image.addEventListener('error', () => (card.portrait.innerHTML = fallback), {
            once: true,
          });
          card.portrait.replaceChildren(image);
        } else {
          card.portrait.innerHTML = fallback;
        }
      }
    }
    this.portraits = portraitsKey;
    this.renderMoves(state);
  }

  /** Called a few times a second with each side's remaining (or used) time. */
  renderClocks(times: Record<Color, number>, running: Color | null): void {
    const topColor: Color = this.bottomColor === 'w' ? 'b' : 'w';
    this.top.clock.textContent = formatClock(times[topColor]);
    this.bottom.clock.textContent = formatClock(times[this.bottomColor]);
    this.top.clock.classList.toggle('active', running === topColor);
    this.bottom.clock.classList.toggle('active', running === this.bottomColor);
  }

  private renderMoves(state: GameState): void {
    const key = state.history.map((m) => m.san).join(' ');
    if (key === this.renderedMoves) return;
    this.renderedMoves = key;
    this.list.replaceChildren();
    const startsWithBlack = state.history[0]?.color === 'b';
    const moves = startsWithBlack ? [null, ...state.history] : [...state.history];
    for (let i = 0; i < moves.length; i += 2) {
      const row = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'move-number';
      number.textContent = `${i / 2 + 1}.`;
      row.append(number);
      for (const move of [moves[i], moves[i + 1]]) {
        const cell = document.createElement('span');
        cell.className = 'move-san';
        cell.textContent = move ? move.san : move === null ? '…' : '';
        row.append(cell);
      }
      this.list.append(row);
    }
    const cells = this.list.querySelectorAll('.move-san');
    const last = [...cells].filter((c) => c.textContent && c.textContent !== '…').at(-1);
    last?.classList.add('current');
    this.list.scrollTop = this.list.scrollHeight;
  }
}
