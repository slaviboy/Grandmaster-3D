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

// Game sounds synthesised with Web Audio, so there are no audio files: a wooden clack for a move,
// a double knock for a capture, a soft bell for check and a short chord when the game ends. Audio
// starts after the first click or key press, as browsers require.

import type { SoundEffect, SoundPort } from '../game/GameController.ts';

export class SoundManager implements SoundPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    const unlock = () => {
      void this.ensure()?.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
      const length = Math.floor(this.context.sampleRate * 0.25);
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.context = null;
    }
    return this.context;
  }

  play(effect: SoundEffect): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (effect) {
      case 'move':
        this.clack(t, 1);
        break;
      case 'castle':
        this.clack(t, 1);
        this.clack(t + 0.16, 0.9);
        break;
      case 'capture':
        this.clack(t, 1.15);
        this.clack(t + 0.07, 0.8, 0.85);
        break;
      case 'promote':
        this.clack(t, 1);
        this.tone(t + 0.05, 880, 0.25, 0.12);
        break;
      case 'check':
        this.clack(t, 1);
        this.tone(t + 0.04, 740, 0.5, 0.16);
        this.tone(t + 0.04, 1110, 0.4, 0.08);
        break;
      case 'illegal':
        this.tone(t, 180, 0.12, 0.12, 'square');
        break;
      case 'shatter':
        // Splintering wood: a sharp crack and a scatter of smaller knocks.
        this.clack(t, 1.4, 0.7);
        for (let i = 1; i < 6; i++)
          this.clack(t + 0.03 * i + Math.random() * 0.03, 0.5 / i, 1.2 + Math.random() * 0.6);
        break;
      case 'gameEnd':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.09, f, 0.9, 0.12));
        break;
    }
  }

  /** A short filtered noise burst with a low thump: wood on wood. */
  private clack(t: number, level: number, pitch = 1): void {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = pitch * (0.95 + Math.random() * 0.1);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2200 * pitch;
    band.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9 * level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    source.connect(band).connect(gain).connect(this.master!);
    source.start(t);
    source.stop(t + 0.12);
    this.tone(t, 190 * pitch, 0.08, 0.5 * level);
  }

  private tone(
    t: number,
    frequency: number,
    duration: number,
    level: number,
    type: OscillatorType = 'sine',
  ): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
}
