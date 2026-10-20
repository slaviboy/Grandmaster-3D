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

import { describe, expect, it } from 'vitest';
import { OnlineMedia } from '../../src/net/OnlineMedia.ts';
import { OnlineSession } from '../../src/net/OnlineSession.ts';
import { MemoryLink, plug, settle } from '../support/memoryLink.ts';
import { device, invite } from '../support/onlineSides.ts';

/** A camera or microphone track with the parts the game uses. */
class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  constructor(readonly kind: 'audio' | 'video') {
    super();
  }
  stop() {
    this.readyState = 'ended';
  }
  mute(on: boolean) {
    this.muted = on;
    this.dispatchEvent(new Event(on ? 'mute' : 'unmute'));
  }
  end() {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
  removeTrack(t: FakeTrack) {
    this.tracks.splice(this.tracks.indexOf(t), 1);
  }
}

type Track = MediaStreamTrack;

function devices(denied = false) {
  const asked: MediaStreamConstraints[] = [];
  const started: FakeTrack[] = [];
  return {
    asked,
    started,
    options: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        asked.push(constraints);
        if (denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        const track = new FakeTrack(constraints.audio ? 'audio' : 'video');
        started.push(track);
        return new FakeStream([track]) as unknown as MediaStream;
      },
      createStream: (tracks: Track[]) =>
        new FakeStream(tracks as unknown as FakeTrack[]) as unknown as MediaStream,
    },
  };
}

function media(denied = false) {
  const d = devices(denied);
  const link = new MemoryLink();
  const reports: Array<[boolean, boolean]> = [];
  const m = new OnlineMedia(link, {
    ...d.options,
    onLocalChange: (mic, cam) => reports.push([mic, cam]),
  });
  return { ...d, link, m, reports };
}

describe('OnlineMedia', () => {
  it('starts with everything off and asks for a device only when it is turned on', async () => {
    const { m, asked, link } = media();
    expect(m.state.get()).toMatchObject({ mic: 'off', cam: 'off', preview: null });
    expect(asked).toEqual([]);
    await m.toggleMic();
    expect(asked).toHaveLength(1);
    expect(asked[0]!.video).toBeUndefined();
    expect(m.state.get().mic).toBe('on');
    expect([...link.tracks.keys()].map((t) => t.kind)).toEqual(['audio']);
  });

  it('turning the camera off stops the device itself and stops sending it', async () => {
    const { m, link, started, reports } = media();
    await m.toggleCam();
    expect(m.state.get()).toMatchObject({ cam: 'on' });
    expect(m.state.get().preview).not.toBeNull();
    await m.toggleCam();
    expect(started[0]!.readyState).toBe('ended');
    expect(link.tracks.size).toBe(0);
    expect(m.state.get()).toMatchObject({ cam: 'off', preview: null });
    expect(reports).toEqual([
      [false, true],
      [false, false],
    ]);
  });

  it('says so when the browser blocks a device, and sends nothing', async () => {
    const { m, link } = media(true);
    await m.toggleCam();
    expect(m.state.get().cam).toBe('blocked');
    expect(m.state.get().error).toMatch(/camera is blocked/);
    expect(link.tracks.size).toBe(0);
  });

  it("shows the other player's media from the tracks that arrive, not from what they say", () => {
    const { m } = media();
    const voice = new FakeTrack('audio');
    voice.muted = true;
    m.receive(voice as unknown as Track);
    expect(m.state.get().friendAudio).toBeNull();
    voice.mute(false);
    expect(m.state.get().friendAudio).not.toBeNull();
    const camera = new FakeTrack('video');
    m.receive(camera as unknown as Track);
    expect(m.state.get().friendVideo).not.toBeNull();
    camera.mute(true);
    expect(m.state.get().friendVideo).toBeNull();
    camera.mute(false);
    camera.end();
    expect(m.state.get().friendVideo).toBeNull();
  });

  it('takes one picture and one sound from the other player, and stops any extra', () => {
    const { m } = media();
    const first = new FakeTrack('video');
    const second = new FakeTrack('video');
    m.receive(first as unknown as Track);
    const shown = m.state.get().friendVideo;
    m.receive(second as unknown as Track);
    expect(second.readyState).toBe('ended');
    expect(m.state.get().friendVideo).toBe(shown);
    // Once the first one ends (the camera was turned off), a new one is welcome.
    first.end();
    const third = new FakeTrack('video');
    m.receive(third as unknown as Track);
    expect(third.readyState).toBe('live');
    expect(m.state.get().friendVideo).not.toBe(shown);
  });

  it('the speaker toggle mutes the other player on this device only', () => {
    const { m } = media();
    m.toggleSpeaker();
    expect(m.state.get().speakerMuted).toBe(true);
  });

  it('stopping turns every device off and lets go of the other player', async () => {
    const { m, started, link } = media();
    await m.toggleMic();
    await m.toggleCam();
    m.receive(new FakeTrack('video') as unknown as Track);
    m.stop();
    expect(started.every((t) => t.readyState === 'ended')).toBe(true);
    expect(link.tracks.size).toBe(0);
    expect(m.state.get()).toMatchObject({ mic: 'off', cam: 'off', friendVideo: null });
    await m.toggleCam();
    expect(m.state.get().cam).toBe('off');
  });
});

describe('media in an online game', () => {
  async function game() {
    const me = device();
    const d = devices();
    const link = new MemoryLink();
    const friend = new MemoryLink();
    const session = OnlineSession.host({
      link,
      game: me.game,
      invite,
      name: 'Ana',
      color: 'w',
      minutes: 5,
      timers: me.timers,
      media: d.options,
    });
    plug(link, friend);
    await settle();
    return { session, link, friend, asked: d.asked };
  }

  it('nothing the other player sends can turn on a camera or microphone here', async () => {
    const { session, friend, asked } = await game();
    friend.sendRaw({ t: 'hello', v: 1, name: 'Eve' });
    friend.sendRaw({ t: 'media', mic: true, cam: true });
    friend.sendRaw({ t: 'media', mic: true, cam: true, start: true });
    await settle();
    expect(asked).toEqual([]);
    expect(session.media.state.get()).toMatchObject({ mic: 'off', cam: 'off' });
    expect(session.state.get().friendMedia).toEqual({ mic: true, cam: true });
  });

  it('holds tracks until the other player has shown who they are', async () => {
    const { session, link, friend } = await game();
    const early = new FakeTrack('video');
    link.handlers.track?.(early as unknown as Track, new FakeStream() as unknown as MediaStream);
    expect(session.media.state.get().friendVideo).toBeNull();
    friend.sendRaw({ t: 'hello', v: 1, name: 'Eve' });
    await settle();
    expect(session.media.state.get().friendVideo).not.toBeNull();
  });

  it("a stranger's tracks are stopped when the stranger is turned away", async () => {
    const { session, link, friend } = await game();
    friend.sendRaw({ t: 'hello', v: 1, name: 'Ben' });
    await settle();
    friend.kick();
    await settle();
    const stranger = new MemoryLink();
    plug(link, stranger);
    await settle();
    const sneaky = new FakeTrack('video');
    link.handlers.track?.(sneaky as unknown as Track, new FakeStream() as unknown as MediaStream);
    stranger.sendRaw({ t: 'hello', v: 1, name: 'Eve' });
    await settle();
    expect(sneaky.readyState).toBe('ended');
    expect(session.state.get().friendName).toBe('Ben');
  });

  it('leaving stops the devices', async () => {
    const { session, friend } = await game();
    friend.sendRaw({ t: 'hello', v: 1, name: 'Ben' });
    await settle();
    await session.media.toggleCam();
    expect(session.media.state.get().cam).toBe('on');
    session.dispose();
    expect(session.media.state.get().cam).toBe('off');
  });
});
