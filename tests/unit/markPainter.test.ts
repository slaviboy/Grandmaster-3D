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
import { paintMarks, type HighlightState, type MarkContext } from '../../src/scene/markPainter.ts';

interface Call {
  readonly op: string;
  readonly args: readonly unknown[];
  readonly style?: unknown;
}

/** A 2D context that records what is drawn, with the colour in use for each stroke or fill. */
function recorder(): { ctx: MarkContext; calls: Call[] } {
  const calls: Call[] = [];
  const state = { strokeStyle: '' as unknown, fillStyle: '' as unknown, lineWidth: 1 };
  const record =
    (op: string, style?: unknown) =>
    (...args: unknown[]) => {
      calls.push({ op, args, style });
    };
  const ctx = {
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v) {
      state.strokeStyle = v;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v) {
      state.fillStyle = v;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v) {
      state.lineWidth = v;
    },
    beginPath: record('beginPath'),
    arc: (...args: unknown[]) => calls.push({ op: 'arc', args }),
    stroke: () => calls.push({ op: 'stroke', args: [], style: state.strokeStyle }),
    fill: () => calls.push({ op: 'fill', args: [], style: state.fillStyle }),
    fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args, style: state.fillStyle }),
    strokeRect: (...args: unknown[]) =>
      calls.push({ op: 'strokeRect', args, style: state.strokeStyle }),
    setLineDash: (...args: unknown[]) => calls.push({ op: 'setLineDash', args }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  } as unknown as MarkContext;
  return { ctx, calls };
}

const ALL = { showLegal: true, showLast: true };
const WHITE_RING = 'rgba(255,255,255,0.9)';

function strokes(calls: Call[], colour: string): number {
  return calls.filter((c) => c.op === 'stroke' && c.style === colour).length;
}

describe('paintMarks', () => {
  it('draws nothing for an empty state', () => {
    const { ctx, calls } = recorder();
    paintMarks(ctx, {}, ALL, 800);
    expect(calls).toEqual([]);
  });

  it('places squares with rank 8 at the top and the a-file on the left', () => {
    const { ctx, calls } = recorder();
    paintMarks(ctx, { selected: 'a1' }, ALL, 800);
    expect(calls).toContainEqual(
      expect.objectContaining({ op: 'fillRect', args: [0, 700, 100, 100] }),
    );
    const top = recorder();
    paintMarks(top.ctx, { selected: 'h8' }, ALL, 800);
    expect(top.calls).toContainEqual(
      expect.objectContaining({ op: 'fillRect', args: [700, 0, 100, 100] }),
    );
  });

  it('rings the last move only when Show Last Move is on', () => {
    const state: HighlightState = { lastMove: { from: 'e2', to: 'e4' } };
    const on = recorder();
    paintMarks(on.ctx, state, ALL, 800);
    expect(strokes(on.calls, WHITE_RING)).toBe(2);
    const off = recorder();
    paintMarks(off.ctx, state, { ...ALL, showLast: false }, 800);
    expect(strokes(off.calls, WHITE_RING)).toBe(0);
  });

  it('draws legal-move dots and capture rings only when Show Legal Moves is on', () => {
    const state: HighlightState = { targets: ['e3', 'e4', 'd3'], captures: ['d3'] };
    const on = recorder();
    paintMarks(on.ctx, state, ALL, 800);
    expect(on.calls.filter((c) => c.op === 'fill')).toHaveLength(2);
    expect(on.calls.filter((c) => c.op === 'stroke')).toHaveLength(1);
    const off = recorder();
    paintMarks(off.ctx, state, { ...ALL, showLegal: false }, 800);
    expect(off.calls).toEqual([]);
  });

  it('draws the coach zones in their colour', () => {
    const { ctx, calls } = recorder();
    paintMarks(ctx, { zones: ['d4', 'e5'], zoneColour: 'rgba(1,2,3,0.4)' }, ALL, 800);
    const fills = calls.filter((c) => c.op === 'fillRect');
    expect(fills).toHaveLength(2);
    expect(fills.every((c) => c.style === 'rgba(1,2,3,0.4)')).toBe(true);
  });

  it('turns the dashed line off again after the cursor', () => {
    const { ctx, calls } = recorder();
    paintMarks(ctx, { cursor: 'e4' }, ALL, 800);
    const dashes = calls.filter((c) => c.op === 'setLineDash');
    expect(dashes).toHaveLength(2);
    expect(dashes.at(-1)?.args).toEqual([[]]);
  });
});
