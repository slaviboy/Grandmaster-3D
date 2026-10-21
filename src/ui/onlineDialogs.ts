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

// The dialogs of online play: the warning every player must accept before anything connects, the
// invitation link to send, the wait while connecting, and the other player's offers. They draw in
// whichever interface is showing.

import type { Store } from '../core/Store.ts';
import type { OnlineState } from '../net/OnlineSession.ts';
import { MAX_NAME_LENGTH, cleanName } from '../net/protocol.ts';
import { el, openDialog } from './Dialog.ts';
import { qrCode } from './qr.ts';

export type ConsentKind = 'host' | 'guest' | 'rejoin' | 'rematch';

const INTRO: Record<ConsentKind, string> = {
  host: 'You will get a link to send to your friend. The game starts when they open it.',
  guest: 'You were invited to play an online game.',
  rejoin: 'You were playing an online game in this tab. Join it again?',
  rematch: 'Play another game against the same player?',
};

const TITLE: Record<ConsentKind, string> = {
  host: 'Play a Friend Online',
  guest: 'Join an Online Game',
  rejoin: 'Rejoin the Online Game',
  rematch: 'Rematch',
};

const CONTINUE: Record<ConsentKind, string> = {
  host: 'Create Link',
  guest: 'Join Game',
  rejoin: 'Rejoin',
  rematch: 'Rematch',
};

function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/**
 * The warning before any online game: the other player can find this computer's IP address, links
 * are for people the player trusts, and online play is for adults only. The 18+ box starts
 * unticked every time and nothing is remembered; Continue stays off until it is ticked. Resolves
 * with the player's name, or null if they back out (Cancel, X or Escape; a tap beside the dialog
 * would drop the invitation, so it does nothing). Nothing connects before this resolves.
 */
export function consentDialog(kind: ConsentKind, name: string): Promise<{ name: string } | null> {
  return openDialog<{ name: string } | null>(
    TITLE[kind],
    null,
    ({ body, root, close }) => {
      root.classList.add('online-dialog');
      const intro = el('p', 'online-intro', INTRO[kind]);

      const nameField = el('label', 'field');
      const nameInput = el('input');
      nameInput.type = 'text';
      nameInput.maxLength = MAX_NAME_LENGTH;
      nameInput.autocomplete = 'off';
      nameInput.spellcheck = false;
      nameInput.value = name;
      nameField.append(el('span', '', 'Your name (the other player sees it)'), nameInput);

      const warning = el('div', 'online-warning');
      warning.setAttribute('role', 'note');
      const points = el('ul');
      const point = (strong: string, rest: string) => {
        const item = el('li');
        item.append(el('strong', '', strong), document.createTextNode(` ${rest}`));
        points.append(item);
      };
      point(
        'The other player will be able to find your IP address',
        '(your approximate location and internet provider): online play connects your computer ' +
          'directly to theirs. Share game links only with people you know and trust.',
      );
      point(
        'Video and voice chat',
        'show your camera and microphone to the other player, but only after you turn them on.',
      );
      point('Online play is for adults only.', 'Not for children.');
      warning.append(el('div', 'online-warning-title', 'Before you play online'), points);

      const consent = el('label', 'online-consent');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = false;
      box.required = true;
      consent.append(
        box,
        el(
          'span',
          '',
          'I am 18 or older and understand that my IP address will be visible to the other player.',
        ),
      );

      const go = button(CONTINUE[kind], () => {
        if (!box.checked) return;
        close({ name: cleanName(nameInput.value, 'Player') });
      });
      go.disabled = true;
      box.addEventListener('change', () => (go.disabled = !box.checked));
      const cancel = button('Cancel', () => close(null), 'btn btn-quiet');
      const actions = el('div', 'dialog-actions');
      actions.append(go, cancel);
      body.append(intro, nameField, warning, consent, actions);
    },
    { backdropCloses: false },
  );
}

export type WaitResult = 'playing' | 'cancelled' | 'failed';

/**
 * Waits for the other player: for the host it shows the invitation link with a Copy button and as
 * a QR code to scan, for the guest only the progress. Closes by itself when the game starts. Cancel (or Escape) resolves
 * 'cancelled'; a connection that fails shows why and resolves 'failed' when dismissed. A tap
 * beside it does nothing: closing ends the game the friend may be opening.
 */
export function waitDialog(state: Store<OnlineState>, link: string | null): Promise<WaitResult> {
  let unsubscribe = () => {};
  const done = openDialog<WaitResult>(
    link ? 'Invite a Friend' : 'Joining the Game',
    'cancelled',
    ({ body, root, close }) => {
      root.classList.add('online-dialog');
      if (link) {
        body.append(el('p', '', 'Send this link to your friend. It is for this game only.'));
        const row = el('div', 'online-link');
        const field = el('input');
        field.type = 'text';
        field.readOnly = true;
        field.value = link;
        // No width of its own (20 characters by default): the row gives it what is left beside
        // Copy, so it never pushes past the dialog's edge on a narrow screen.
        field.size = 1;
        field.setAttribute('aria-label', 'Game link');
        // setSelectionRange, not select(): iPhones ignore select() on a read-only field.
        const selectAll = () => field.setSelectionRange(0, field.value.length);
        field.addEventListener('focus', selectAll);
        const copy = button('Copy', () => {
          selectAll();
          void navigator.clipboard
            ?.writeText(link)
            .then(() => (copy.textContent = 'Copied'))
            .catch(() => (copy.textContent = 'Press Ctrl+C'));
        });
        copy.setAttribute('autofocus', '');
        row.append(field, copy);
        const figure = el('figure', 'online-qr');
        const code = el('div', 'online-qr-code');
        code.setAttribute('role', 'img');
        code.setAttribute('aria-label', 'QR code of the game link');
        const qr = qrCode(link);
        code.innerHTML = qr.svg;
        // Large, with whole pixels per module so every edge is sharp: about 5 px per module on a
        // computer and 4 on a phone, which cameras read at a glance.
        const target = Math.min(340, window.innerWidth * 0.7);
        code.style.width = `${Math.max(3, Math.floor(target / qr.total)) * qr.total}px`;
        figure.append(
          code,
          el('figcaption', '', "Or let your friend scan it with their phone's camera."),
        );
        body.append(
          figure,
          row,
          el('p', 'online-reminder', 'Only share it with people you trust.'),
        );
      }
      const status = el('p', 'online-status');
      status.setAttribute('role', 'status');
      const cancel = button('Cancel', () => close('cancelled'), 'btn btn-quiet');
      const actions = el('div', 'dialog-actions');
      actions.append(cancel);
      body.append(status, actions);
      unsubscribe = state.subscribe((s) => {
        if (s.status === 'playing') {
          close('playing');
        } else if (s.status === 'failed' || s.status === 'closed') {
          status.textContent = s.message ?? 'The connection closed.';
          status.classList.add('online-error');
          cancel.textContent = 'Close';
          cancel.onclick = () => close('failed');
        } else {
          // A failed attempt leaves the host waiting, with a note on what happened.
          status.textContent =
            s.message ??
            (s.status === 'waiting' ? 'Waiting for your friend to open the link…' : 'Connecting…');
        }
      });
    },
    { backdropCloses: false },
  );
  return done.finally(() => unsubscribe());
}

/** The other player offers something; resolves true to accept. */
export function offerDialog(title: string, message: string, accept: string): Promise<boolean> {
  return openDialog<boolean>(title, false, ({ body, root, close }) => {
    root.classList.add('online-dialog');
    const actions = el('div', 'dialog-actions');
    actions.append(
      button(accept, () => close(true)),
      button('No, Thanks', () => close(false), 'btn btn-quiet'),
    );
    body.append(el('p', '', message), actions);
  });
}

/** After an online game: a rematch with the same player, or leave for a new game. */
export function nextGameDialog(friend: string): Promise<'rematch' | 'leave' | null> {
  return openDialog<'rematch' | 'leave' | null>('New Game', null, ({ body, root, close }) => {
    root.classList.add('online-dialog');
    const actions = el('div', 'dialog-actions');
    actions.append(
      button('Rematch', () => close('rematch')),
      button('Leave and Start a New Game', () => close('leave')),
      button('Cancel', () => close(null), 'btn btn-quiet'),
    );
    body.append(
      el('p', '', `Play ${friend} again with the colours swapped, or leave the game?`),
      actions,
    );
  });
}
