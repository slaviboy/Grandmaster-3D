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

// Asks which piece a pawn becomes: queen, rook, bishop or knight (click, or press Q R B N).

import { PIECE_NAMES, type Color, type PromotionKind } from '../game/types.ts';
import { el, openDialog } from './Dialog.ts';
import { pieceSvg } from './icons.ts';

const CHOICES: readonly PromotionKind[] = ['q', 'r', 'b', 'n'];

export function askPromotion(color: Color): Promise<PromotionKind | null> {
  return openDialog<PromotionKind | null>('Promote pawn to', null, ({ body, root, close }) => {
    const row = el('div', 'choice-row');
    for (const kind of CHOICES) {
      const button = el('button', 'choice');
      button.type = 'button';
      button.dataset.piece = kind;
      const name = PIECE_NAMES[kind];
      button.innerHTML = `${pieceSvg(color, kind, 40)}<span>${name[0]!.toUpperCase()}${name.slice(1)}</span><kbd>${kind.toUpperCase()}</kbd>`;
      button.addEventListener('click', () => close(kind));
      row.append(button);
    }
    body.append(row);
    root.addEventListener('keydown', (event) => {
      const kind = event.key.toLowerCase() as PromotionKind;
      if (CHOICES.includes(kind)) {
        event.preventDefault();
        close(kind);
      }
    });
  });
}
