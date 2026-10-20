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

// The connection to the other player: a direct WebRTC link, found through public Nostr relays by
// Trystero. This is the only file that touches Trystero or a peer connection.
//
// The invitation's secret is Trystero's password: it encrypts the handshake, so the relays and
// anyone without the link see neither the offer nor the network addresses in it, and it must match
// for a peer to be let in. The first player admitted is the partner; anyone else is refused at the
// handshake, and messages from anyone but the partner are ignored. The room and its peer
// connections stay private to this module: nothing here is put on window or logged.

import { joinRoom, type JsonValue, type MessageAction, type Room } from 'trystero/nostr';
import type { LinkHandlers, LinkPort } from './LinkPort.ts';
import { MAX_MESSAGE_BYTES, type Invite, type Message } from './protocol.ts';

const APP_ID = 'grandmaster-3d';
/** Trystero's own ceiling for anything a peer sends, well above our largest message. */
const MAX_RECEIVE_BYTES = 16 * 1024;

const NO_HANDLERS: LinkHandlers = {
  message: () => undefined,
  join: () => undefined,
  leave: () => undefined,
  error: () => undefined,
};

/** Joins the invitation's room and starts looking for the other player. */
export function openPeerLink(invite: Invite): LinkPort {
  return new PeerLink(invite);
}

class PeerLink implements LinkPort {
  private readonly room: Room;
  private readonly channel: MessageAction<JsonValue>;
  private handlers: LinkHandlers = NO_HANDLERS;
  private partner: string | null = null;
  /** Peers turned away for good: a kicked partner, or a second player. */
  private readonly refused = new Set<string>();
  private stream: MediaStream | null = null;
  private closed = false;

  constructor(invite: Invite) {
    this.room = joinRoom(
      { appId: APP_ID, password: invite.secret, maxReceiveBytes: MAX_RECEIVE_BYTES },
      invite.room,
      {
        onJoinError: ({ error }) => this.handlers.error(friendlyError(error)),
        onPeerHandshake: async (peerId) => {
          if (this.refused.has(peerId) || (this.partner !== null && this.partner !== peerId)) {
            throw new Error('the game already has two players');
          }
        },
      },
    );
    this.channel = this.room.makeAction<JsonValue>('m', {
      // Refuse anything from a stranger, or too big, before it is even read.
      onReceive: ({ peerId, byteLength }) =>
        peerId === this.partner && byteLength <= MAX_MESSAGE_BYTES,
      onMessage: (data, { peerId }) => {
        if (peerId === this.partner) this.handlers.message(data);
      },
    });
    this.room.onPeerJoin = (peerId) => {
      if (this.refused.has(peerId) || (this.partner !== null && this.partner !== peerId)) {
        this.disconnect(peerId);
        return;
      }
      this.partner = peerId;
      if (this.stream)
        void Promise.allSettled(this.room.addStream(this.stream, { target: peerId }));
      this.handlers.join();
    };
    this.room.onPeerLeave = (peerId) => {
      if (peerId !== this.partner) return;
      this.partner = null;
      this.handlers.leave();
    };
    this.room.onPeerStream = (stream, peerId) => {
      if (peerId === this.partner) this.handlers.stream?.(stream);
    };
  }

  get connected(): boolean {
    return this.partner !== null;
  }

  setHandlers(handlers: LinkHandlers): void {
    this.handlers = handlers;
  }

  send(message: Message): Promise<void> {
    if (!this.partner || this.closed) return Promise.resolve();
    // Sending can fail if the connection drops mid-way; the session notices through leave().
    return this.channel
      .send(message as unknown as JsonValue, { target: this.partner })
      .catch(() => undefined);
  }

  ping(): Promise<number> {
    return this.partner ? this.room.ping(this.partner) : Promise.reject(new Error('not connected'));
  }

  setStream(stream: MediaStream | null): void {
    const previous = this.stream;
    this.stream = stream;
    if (!this.partner) return;
    if (previous) this.room.removeStream(previous, { target: this.partner });
    if (stream) void Promise.allSettled(this.room.addStream(stream, { target: this.partner }));
  }

  kick(): void {
    const partner = this.partner;
    if (!partner) return;
    this.refused.add(partner);
    this.partner = null;
    this.disconnect(partner);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.partner = null;
    this.handlers = NO_HANDLERS;
    await this.room.leave();
  }

  private disconnect(peerId: string): void {
    this.refused.add(peerId);
    this.room.getPeers()[peerId]?.close();
  }
}

/** Trystero's errors name peers and servers; the player gets a plain explanation instead. */
function friendlyError(error: string): string {
  if (/password/i.test(error)) return 'This link does not match the game. Ask for a new link.';
  return (
    "Couldn't connect directly to your friend. Some networks, such as mobile data or office " +
    'Wi-Fi, block direct connections; try another network.'
  );
}
