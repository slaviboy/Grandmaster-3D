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

// An online game between two browsers. The host made the link and sets the terms (its colour and
// the time control); the guest opened it. Nothing in between referees, so each side referees what
// it receives: the guard checks size, rate and shape, this session checks who may say what and
// when, and the controller checks the chess. A player who breaks the rules forfeits on the honest
// side, and is disconnected.
//
// Identity: when the guest first arrives the host gives it a random token over the encrypted
// connection. Whoever comes back later must show the same token, in both directions, so a stranger
// holding a leaked link can neither take the guest's seat nor pose as the host.

import { Store } from '../core/Store.ts';
import type { ForfeitReason } from '../game/ChessGame.ts';
import type { GameController, LocalAction } from '../game/GameController.ts';
import { opposite, type Color } from '../game/types.ts';
import type { LinkPort } from './LinkPort.ts';
import { OnlineMedia, type MediaOptions } from './OnlineMedia.ts';
import { PeerGuard } from './PeerGuard.ts';
import { PROTOCOL_VERSION, cleanName, createToken, type Invite, type Message } from './protocol.ts';

/** The most network delay given back to the other side per move, and added to their flag. */
export const MAX_LAG_ALLOWANCE_MS = 300;
/** How long a guest looks for the game before giving up. */
export const CONNECT_TIMEOUT_MS = 45_000;
/** In an untimed game, how long the other player may be away before the win can be claimed. */
export const CLAIM_AFTER_MS = 120_000;
export const PING_EVERY_MS = 3_000;
/** How long a leaving player waits for the goodbye to cross before closing the connection. */
const LEAVE_GRACE_MS = 250;
/** What the host is told when the friend's attempt fails; the link stays open. */
export const HOST_RETRY_MESSAGE =
  "Your friend couldn't connect. Some networks, such as mobile data or office Wi-Fi, block " +
  'direct connections. The link still works: they can open it again, maybe on another network.';

export type Role = 'host' | 'guest';

export type OnlineStatus =
  /** The host made the link; nobody has come yet. */
  | 'waiting'
  /** The guest is looking for the game, or the two are setting up. */
  | 'connecting'
  | 'playing'
  /** The other player's connection dropped; they may come back. */
  | 'away'
  /** No connection could be made. */
  | 'failed'
  /** Over: someone left, or broke the rules. */
  | 'closed';

export interface OnlineState {
  readonly role: Role;
  readonly status: OnlineStatus;
  readonly myName: string;
  readonly friendName: string;
  /** The colour this device plays; the guest learns it from the host. */
  readonly myColor: Color | null;
  readonly minutes: number;
  readonly drawOffer: 'none' | 'sent' | 'received';
  readonly rematch: 'none' | 'sent' | 'received';
  /** In an untimed game, the other player has been away long enough to claim the win. */
  readonly canClaimWin: boolean;
  /** The other player's microphone and camera, as they report them. */
  readonly friendMedia: { readonly mic: boolean; readonly cam: boolean } | null;
  /** Why the session failed or closed, for the player. */
  readonly message: string | null;
}

export type SessionEvent =
  | { readonly kind: 'joined' }
  | { readonly kind: 'returned' }
  | { readonly kind: 'away' }
  | { readonly kind: 'drawOffered' }
  | { readonly kind: 'rematchOffered' }
  | { readonly kind: 'rematchStarted' }
  | { readonly kind: 'left' }
  | { readonly kind: 'violation'; readonly reason: ForfeitReason; readonly detail: string }
  | { readonly kind: 'failed'; readonly text: string };

/** What the session needs from the game. */
export interface SessionGame {
  readonly controller: GameController;
  /** Starts a fresh online game with this device playing `color`. */
  startGame(color: Color, minutes: number): Promise<void>;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const browserTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** What a session keeps for this tab only, so a player who reloads can rejoin. */
export interface SavedSession {
  readonly invite: Invite;
  readonly role: Role;
  readonly token: string | null;
  readonly name: string;
  readonly friendName: string;
  readonly color: Color | null;
  readonly minutes: number;
  readonly moves: readonly string[];
  readonly clocks: Record<Color, number>;
}

export interface SessionStorage {
  save(session: SavedSession): void;
  clear(): void;
}

interface CommonOptions {
  readonly link: LinkPort;
  readonly game: SessionGame;
  readonly invite: Invite;
  readonly name: string;
  readonly timers?: Timers;
  readonly now?: () => number;
  readonly storage?: SessionStorage;
  /** Camera and microphone access; tests pass stand-ins. */
  readonly media?: MediaOptions;
}

export interface HostOptions extends CommonOptions {
  readonly color: Color;
  readonly minutes: number;
}

export type GuestOptions = CommonOptions;

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export class OnlineSession {
  readonly state: Store<OnlineState>;
  readonly invite: Invite;
  /** Video and voice for this game; everything starts off. */
  readonly media: OnlineMedia;
  private readonly link: LinkPort;
  private readonly game: SessionGame;
  private readonly guard: PeerGuard;
  private readonly timers: Timers;
  private readonly storage: SessionStorage | null;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private readonly offLocal: () => void;
  /** The shared secret between host and guest; null until the host has handed it out. */
  private token: string | null;
  /** A game has been set up on this device. */
  private started = false;
  /** The connected peer has shown who they are; nothing else is accepted before that. */
  private verified = false;
  /** Incoming messages are handled one at a time, in order. */
  private queue: Promise<void> = Promise.resolve();
  private lags: number[] = [];
  private allowance = 0;
  private pingTimer: unknown = null;
  private connectTimer: unknown = null;
  private claimTimer: unknown = null;
  private ended = false;
  /** Tracks that arrived before the other player showed who they are. */
  private heldTracks: MediaStreamTrack[] = [];

  /** The player who made the link; the game starts when the guest arrives. */
  static host(options: HostOptions): OnlineSession {
    return new OnlineSession('host', options, options.color, options.minutes, null);
  }

  /** The player who opened a link. */
  static join(options: GuestOptions): OnlineSession {
    return new OnlineSession('guest', options, null, 0, null);
  }

  /** Picks up a game this tab was playing before a reload. */
  static resume(saved: SavedSession, options: Omit<CommonOptions, 'invite' | 'name'>) {
    return new OnlineSession(
      saved.role,
      { ...options, invite: saved.invite, name: saved.name },
      saved.color,
      saved.minutes,
      saved,
    );
  }

  private constructor(
    readonly role: Role,
    options: CommonOptions,
    color: Color | null,
    minutes: number,
    saved: SavedSession | null,
  ) {
    this.link = options.link;
    this.game = options.game;
    this.invite = options.invite;
    this.timers = options.timers ?? browserTimers;
    this.storage = options.storage ?? null;
    this.guard = new PeerGuard(options.now);
    this.token = saved?.token ?? null;
    this.state = new Store<OnlineState>({
      role,
      status: role === 'host' && !saved?.token ? 'waiting' : 'connecting',
      myName: cleanName(options.name, 'Player'),
      friendName: saved?.friendName ?? 'Friend',
      myColor: color,
      minutes,
      drawOffer: 'none',
      rematch: 'none',
      canClaimWin: false,
      friendMedia: null,
      message: null,
    });
    this.media = new OnlineMedia(this.link, {
      ...options.media,
      onLocalChange: (mic, cam) => void this.link.send({ t: 'media', mic, cam }),
    });
    this.offLocal = this.game.controller.onLocalAction((action) => this.onLocal(action));
    this.link.setHandlers({
      message: (data) => this.enqueue(() => this.onMessage(data)),
      track: (track) => {
        if (this.verified) this.media.receive(track);
        else this.heldTracks.push(track);
      },
      join: () => this.enqueue(() => this.onJoin()),
      leave: () => this.enqueue(() => this.onLeave()),
      error: (text) => this.onError(text),
    });
    // A host that reloads picks its own game back up; the guest waits for the host's copy.
    if (role === 'host' && saved?.token && saved.color) {
      const { color: own, moves, clocks } = saved;
      this.enqueue(async () => {
        await this.game.startGame(own, saved.minutes);
        await this.game.controller.restoreOnline(moves, clocks);
        this.started = true;
        this.patch({ status: 'away' });
      });
    }
    if (role === 'guest') this.armConnectTimer();
  }

  /** Hears what happens: arrivals, offers, rule breaks. Returns an unsubscribe. */
  onEvent(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get closed(): boolean {
    return this.ended;
  }

  // --- the player's commands -----------------------------------------------------------------

  /** Offers a draw, or accepts the one on the table. */
  async offerDraw(): Promise<void> {
    if (!this.inPlay()) return;
    const { drawOffer } = this.state.get();
    if (drawOffer === 'sent') return;
    this.link.send({ t: 'draw' });
    if (drawOffer === 'received') {
      this.patch({ drawOffer: 'none' });
      await this.game.controller.agreeDraw();
      this.save();
    } else {
      this.patch({ drawOffer: 'sent' });
    }
  }

  /** Turns down the other player's draw offer. */
  declineDraw(): void {
    if (this.state.get().drawOffer === 'received') this.patch({ drawOffer: 'none' });
  }

  /** Asks for a rematch after a finished game, or accepts the one asked for. */
  async requestRematch(): Promise<void> {
    if (this.ended || !this.started || this.gamePlaying()) return;
    const { rematch } = this.state.get();
    if (rematch === 'sent') return;
    this.link.send({ t: 'rematch' });
    if (rematch === 'received') await this.beginRematch();
    else this.patch({ rematch: 'sent' });
  }

  /** In an untimed game, takes the win from a player who has been gone too long. */
  async claimWin(): Promise<void> {
    if (!this.state.get().canClaimWin || !this.gamePlaying()) return;
    this.patch({ canClaimWin: false });
    await this.game.controller.forfeit('abandoned');
    this.save();
  }

  /** Leaves: resigns a game in progress, says goodbye and closes the connection. */
  async leave(): Promise<void> {
    if (this.ended) return;
    if (this.started && this.gamePlaying()) await this.game.controller.resign();
    await this.link.send({ t: 'bye' });
    // A moment for the goodbye to cross before the connection closes.
    await new Promise<void>((resolve) => this.timers.setTimeout(resolve, LEAVE_GRACE_MS));
    await this.close('closed', null);
  }

  /** Stops everything without a word to the other side (the page is going away). */
  dispose(): void {
    this.stopTimers();
    this.offLocal();
    this.dropHeldTracks();
    this.media.stop();
    this.listeners.clear();
    if (!this.ended) {
      this.ended = true;
      void this.link.close();
    }
  }

  // --- the connection ------------------------------------------------------------------------

  private enqueue(step: () => Promise<void> | void): void {
    this.queue = this.queue.then(step).catch((error: unknown) => console.error('online:', error));
  }

  private onJoin(): void {
    if (this.ended) return;
    this.verified = false;
    this.dropHeldTracks();
    this.clearTimer('claimTimer');
    this.patch({ canClaimWin: false });
    // The host proves itself with the token too, once it has given one out.
    const proof = this.role === 'guest' || this.started ? this.token : null;
    this.link.send({
      t: 'hello',
      v: PROTOCOL_VERSION,
      name: this.state.get().myName,
      ...(proof ? { token: proof } : {}),
    });
    this.startPings();
  }

  private onLeave(): void {
    if (this.ended) return;
    this.verified = false;
    this.dropHeldTracks();
    this.stopPings();
    if (!this.started) {
      // Dropped before the game was set up: the guest gets a fresh while to find it again.
      if (this.role === 'guest') this.armConnectTimer();
      this.patch({ status: this.role === 'host' ? 'waiting' : 'connecting' });
      return;
    }
    this.patch({ status: 'away' });
    this.emit({ kind: 'away' });
    // Timed games run the absent player's clock; untimed ones let the win be claimed later.
    if (this.state.get().minutes === 0 && this.gamePlaying()) {
      this.claimTimer = this.timers.setTimeout(() => {
        if (this.state.get().status === 'away' && this.gamePlaying()) {
          this.patch({ canClaimWin: true });
        }
      }, CLAIM_AFTER_MS);
    }
  }

  private onError(text: string): void {
    if (this.ended || this.started) return;
    // The host keeps the link open, so the friend can simply try again.
    if (this.role === 'host') {
      this.patch({ message: HOST_RETRY_MESSAGE });
      return;
    }
    this.fail(text);
  }

  private async onMessage(data: unknown): Promise<void> {
    if (this.ended) return;
    const verdict = this.guard.check(data);
    if (!verdict.ok) {
      if (verdict.disconnect) await this.violation('invalid-data', 'kept sending invalid data');
      return;
    }
    const message = verdict.message;
    if (message.t === 'hello') return this.onHello(message);
    // Nothing counts from a peer that has not shown who they are.
    if (!this.verified) return;
    switch (message.t) {
      case 'setup':
        return this.onSetup(message);
      case 'sync':
        return this.onSync(message);
      case 'move':
        return this.onMove(message);
      case 'resign':
        if (this.started) await this.game.controller.remoteResigned();
        return this.save();
      case 'flag':
        if (this.started) await this.game.controller.remoteFlagged();
        return this.save();
      case 'draw':
        return this.onDraw();
      case 'rematch':
        return this.onRematch();
      case 'media':
        this.patch({ friendMedia: { mic: message.mic, cam: message.cam } });
        return;
      case 'bye':
        return this.onBye();
    }
  }

  private async onHello(message: Extract<Message, { t: 'hello' }>): Promise<void> {
    if (this.verified) return;
    const proven = this.token !== null && message.token === this.token;
    if (this.role === 'host') {
      if (this.token && !proven) {
        // Someone with the link, but not the guest who sat down: turned away.
        this.dropHeldTracks();
        this.link.kick();
        return;
      }
      this.trust();
      const first = this.token === null;
      if (first) {
        this.token = createToken();
        this.patch({ friendName: message.name });
      }
      const { myColor, minutes } = this.state.get();
      this.link.send({ t: 'setup', hostColor: myColor!, minutes, token: this.token! });
      if (!this.started) {
        await this.game.startGame(myColor!, minutes);
        this.started = true;
      } else {
        const controller = this.game.controller;
        this.link.send({
          t: 'sync',
          moves: controller.game.history().map((m) => m.lan),
          clocks: controller.clock.usedTimes(),
        });
      }
      this.patch({ status: 'playing', message: null });
      this.emit({ kind: first ? 'joined' : 'returned' });
      this.save();
      return;
    }
    // The guest: once it holds a token, the host must show the same one.
    if (this.token && !proven) {
      this.dropHeldTracks();
      this.link.kick();
      return;
    }
    this.trust();
    if (!this.token) this.patch({ friendName: message.name });
    if (this.started) {
      this.patch({ status: 'playing', message: null });
      this.emit({ kind: 'returned' });
    }
  }

  private async onSetup(message: Extract<Message, { t: 'setup' }>): Promise<void> {
    // Only the host sets the terms, once; later setups (a rejoin repeats them) change nothing.
    if (this.role !== 'guest' || this.started) return;
    if (this.token && message.token !== this.token) return;
    this.token = message.token;
    const color = opposite(message.hostColor);
    this.patch({ myColor: color, minutes: message.minutes });
    await this.game.startGame(color, message.minutes);
    this.started = true;
    this.clearTimer('connectTimer');
    this.patch({ status: 'playing', message: null });
    this.emit({ kind: 'joined' });
    this.save();
  }

  private async onSync(message: Extract<Message, { t: 'sync' }>): Promise<void> {
    if (this.role !== 'guest' || !this.started) return;
    const controller = this.game.controller;
    if (!this.gamePlaying()) return;
    if (await controller.restoreOnline(message.moves, message.clocks)) return this.save();
    // The host may have missed this side's last move while the connection was down: send it again.
    const own = controller.game.history();
    const behind =
      message.moves.length < own.length && message.moves.every((uci, i) => own[i]!.lan === uci);
    if (!behind) return this.violation('invalid-data', 'sent a game that does not match');
    for (let ply = message.moves.length; ply < own.length; ply++) {
      const move = own[ply]!;
      if (move.color === this.state.get().myColor)
        this.link.send({ t: 'move', uci: move.lan, ply });
    }
  }

  private async onMove(message: Extract<Message, { t: 'move' }>): Promise<void> {
    if (!this.started) return;
    const result = await this.game.controller.applyRemoteMove(
      message.uci,
      message.ply,
      this.allowance,
    );
    if (result === 'rejected') return this.violation('invalid-move', 'sent an invalid move');
    if (result === 'played') this.patch({ drawOffer: 'none' });
    this.save();
  }

  private async onDraw(): Promise<void> {
    if (!this.inPlay()) return;
    const { drawOffer } = this.state.get();
    if (drawOffer === 'sent') {
      // Our offer, accepted.
      this.patch({ drawOffer: 'none' });
      await this.game.controller.agreeDraw();
      this.save();
    } else if (drawOffer === 'none') {
      this.patch({ drawOffer: 'received' });
      this.emit({ kind: 'drawOffered' });
    }
  }

  private async onRematch(): Promise<void> {
    if (!this.started || this.gamePlaying()) return;
    const { rematch } = this.state.get();
    if (rematch === 'sent') await this.beginRematch();
    else if (rematch === 'none') {
      this.patch({ rematch: 'received' });
      this.emit({ kind: 'rematchOffered' });
    }
  }

  private async onBye(): Promise<void> {
    if (this.started && this.gamePlaying()) await this.game.controller.forfeit('abandoned');
    const name = this.state.get().friendName;
    this.emit({ kind: 'left' });
    await this.close('closed', `${name} left the game.`);
  }

  /** Both players asked: the colours swap and a new game starts. */
  private async beginRematch(): Promise<void> {
    const { myColor, minutes } = this.state.get();
    const color = opposite(myColor!);
    this.patch({ rematch: 'none', drawOffer: 'none', myColor: color });
    await this.game.startGame(color, minutes);
    this.emit({ kind: 'rematchStarted' });
    this.save();
  }

  // --- the local player's actions --------------------------------------------------------------

  private onLocal(action: LocalAction): void {
    // Moves in any other kind of game are nobody else's business.
    if (this.ended || !this.started || this.game.controller.state.get().mode !== 'online') return;
    switch (action.kind) {
      case 'move':
        this.link.send({ t: 'move', uci: action.record.lan, ply: action.ply });
        this.patch({ drawOffer: 'none' });
        break;
      case 'resign':
        this.link.send({ t: 'resign' });
        break;
      case 'flag':
        this.link.send({ t: 'flag' });
        break;
    }
    this.save();
  }

  // --- rule breaks, timing and bookkeeping ---------------------------------------------------

  /** The other side broke the rules: the honest player wins and the connection is cut. */
  private async violation(reason: ForfeitReason, detail: string): Promise<void> {
    if (this.ended) return;
    const name = this.state.get().friendName;
    if (this.started && this.gamePlaying()) await this.game.controller.forfeit(reason);
    // Logged for the honest player; this names what happened, never where it came from.
    console.warn(`online: ${name}'s app ${detail}; the game is over and the connection closed.`);
    this.emit({ kind: 'violation', reason, detail });
    this.link.kick();
    await this.close('closed', `Game ended: ${name}'s app ${detail}.`);
  }

  /** The connected peer showed who they are: their camera and microphone may now come through. */
  private trust(): void {
    this.verified = true;
    for (const track of this.heldTracks.splice(0)) this.media.receive(track);
    const { mic, cam } = this.media.state.get();
    if (mic === 'on' || cam === 'on') {
      void this.link.send({ t: 'media', mic: mic === 'on', cam: cam === 'on' });
    }
  }

  /** The guest gives up if no game is set up in time, whether or not a connection was made. */
  private armConnectTimer(): void {
    this.clearTimer('connectTimer');
    this.connectTimer = this.timers.setTimeout(() => {
      if (!this.started) {
        this.fail("Couldn't reach the game. Check the link, or ask your friend for a new one.");
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private dropHeldTracks(): void {
    for (const track of this.heldTracks.splice(0)) track.stop();
  }

  private fail(text: string): void {
    if (this.ended) return;
    this.emit({ kind: 'failed', text });
    void this.close('failed', text);
  }

  private async close(status: OnlineStatus, message: string | null): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.stopTimers();
    this.offLocal();
    this.dropHeldTracks();
    this.media.stop();
    this.patch({ status, message, canClaimWin: false });
    this.storage?.clear();
    await this.link.close();
  }

  private startPings(): void {
    this.stopPings();
    const measure = () => {
      void this.link.ping().then(
        (rtt) => {
          if (!Number.isFinite(rtt) || rtt < 0) return;
          this.lags = [...this.lags.slice(-4), rtt];
          // Half a round trip each way: a move's delay is the full round trip. A peer that slows
          // its answers on purpose gains at most the cap.
          this.allowance = Math.min(MAX_LAG_ALLOWANCE_MS, median(this.lags));
          this.game.controller.setLagAllowance(this.allowance);
        },
        () => undefined,
      );
    };
    measure();
    this.pingTimer = this.timers.setInterval(measure, PING_EVERY_MS);
  }

  private stopPings(): void {
    if (this.pingTimer !== null) this.timers.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearTimer(name: 'connectTimer' | 'claimTimer'): void {
    if (this[name] !== null) this.timers.clearTimeout(this[name]);
    this[name] = null;
  }

  private stopTimers(): void {
    this.stopPings();
    this.clearTimer('connectTimer');
    this.clearTimer('claimTimer');
  }

  /** Connected, set up and the game not over. */
  private inPlay(): boolean {
    return (
      !this.ended && this.started && this.state.get().status === 'playing' && this.gamePlaying()
    );
  }

  private gamePlaying(): boolean {
    return this.game.controller.state.get().status.kind === 'playing';
  }

  private save(): void {
    if (!this.storage || this.ended || !this.token) return;
    const s = this.state.get();
    const controller = this.game.controller;
    this.storage.save({
      invite: this.invite,
      role: this.role,
      token: this.token,
      name: s.myName,
      friendName: s.friendName,
      color: s.myColor,
      minutes: s.minutes,
      moves: controller.game.history().map((m) => m.lan),
      clocks: controller.clock.usedTimes(),
    });
  }

  private patch(patch: Partial<OnlineState>): void {
    this.state.update(patch);
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
