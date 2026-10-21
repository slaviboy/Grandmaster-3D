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

// The 2D board: the game seen straight from above on one canvas, in the style of a classic desktop
// chess program. The squares, the frame and its engraved coordinates are painted from the chosen
// board look, the space around it from the chosen table, and the pieces are flat figures in the
// piece set's colours. To the controller it is a board view like the 3D one, and it takes the same
// input: click a piece and then a square, or drag it; Shift+arrows move a square cursor and Enter
// or Space select and move.
//
// It draws only while shown, and only when something changed.

import { createRng } from '../core/rng.ts';
import type { MoveInput, MoveRecord } from '../game/ChessGame.ts';
import type { BoardViewPort, MoveMarks } from '../game/GameController.ts';
import type { BoardMap, Color } from '../game/types.ts';
import type { Tweener } from '../scene/animation/tween.ts';
import {
  squareFromIndices,
  squareIndices,
  squareToWorld,
  worldToSquare,
  type BoardPoint,
  type Square,
} from '../scene/coords.ts';
import { paintMarks, type HighlightState } from '../scene/markPainter.ts';
import type { BoardTheme, PieceTheme, TableTheme } from '../scene/themes.ts';
import {
  drawCracked,
  drawFelt,
  drawFrameCanvas,
  drawGrain,
  drawSquares,
} from '../scene/woodTextures.ts';
import {
  FRAME,
  NO_EDGES,
  SPAN,
  cellSize,
  fitBoard,
  toBoard,
  toScreen,
  type BoardRect,
  type Edges,
  type Side,
} from './flatGeometry.ts';
import { FlatPieces, type FlatSnapshot } from './FlatPieces.ts';
import { drawPiece, pieceColours, type PieceColours } from './pieceArt.ts';

/** What the board asks of the game; the same rules the 3D board uses. */
export interface FlatRules {
  canPick(square: Square): boolean;
  legalTargets(square: Square): Square[];
  isCapture(from: Square, to: Square): boolean;
  /** Plays the move if legal; resolves false if it was refused. */
  move(input: MoveInput): Promise<boolean>;
}

/** The Chess Coach's aids on the board. */
export type CoachMarks = Pick<HighlightState, 'zones' | 'zoneColour' | 'spots' | 'pawnMarks'>;

export interface FlatOptions {
  readonly showLegalMoves: boolean;
  readonly showLastMove: boolean;
  readonly showCoordinates: boolean;
}

const DRAG_THRESHOLD = 5;
/** The figure's art box is a little larger than its square, so the pieces fill it as on paper. */
const PIECE_BOX = 1.06;
/** How far a piece in the air is drawn above its shadow, in squares per square of height. */
const RAISE = 0.35;
/** The table pattern repeats every this many squares, as the cloth does under the 3D board. */
const TABLE_REPEAT = 12;

interface Press {
  readonly pointerId: number;
  readonly square: Square;
  readonly x: number;
  readonly y: number;
  dragging: boolean;
  readonly wasSelected: boolean;
}

export class FlatBoard implements BoardViewPort {
  readonly canvas: HTMLCanvasElement;
  readonly pieces: FlatPieces;
  private readonly ctx: CanvasRenderingContext2D;
  private shown = false;
  private dirty = true;
  private side: Side = 'white';
  private edges: Edges = NO_EDGES;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private rect: BoardRect = { cx: 0, cy: 0, size: 0 };
  private looks: { board: BoardTheme; table: TableTheme } | null = null;
  private colours: Record<Color, PieceColours> | null = null;
  private options: FlatOptions = {
    showLegalMoves: true,
    showLastMove: true,
    showCoordinates: true,
  };
  private marks: HighlightState = {};
  /** The painted board (frame, coordinates and squares), per side and pixel size. */
  private readonly boardImages = new Map<string, HTMLCanvasElement>();
  private table: { tile: HTMLCanvasElement; pattern: CanvasPattern | null } | null = null;

  private enabled = false;
  private selected: Square | null = null;
  private press: Press | null = null;
  private cursor: Square | null = null;
  private busy = false;
  /** Where a dragged piece was let go, so its move settles from there. */
  private pendingDrop: {
    readonly from: Square;
    readonly to: Square;
    readonly at: BoardPoint;
  } | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly root: HTMLElement,
    tweener: Tweener,
    settings: () => { readonly followPath: boolean },
    private readonly rules: FlatRules,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flat-board';
    this.canvas.setAttribute('aria-label', 'Chess board');
    this.canvas.style.display = 'none';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    root.append(this.canvas);
    this.pieces = new FlatPieces(tweener, settings, () => (this.dirty = true));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Shows or hides the board; hidden, it draws nothing and takes no input. */
  show(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    this.canvas.style.display = shown ? '' : 'none';
    if (!shown) {
      this.cancelDrag();
      this.select(null);
      this.setCursor(null);
    }
    this.dirty = true;
  }

  /** Called every frame; paints when shown and something changed. */
  frame(): void {
    if (this.shown && this.dirty) this.drawNow();
  }

  // --- the board as the controller sees it ---------------------------------------------------

  sync(board: BoardMap): void {
    this.pendingDrop = null;
    this.pieces.sync(board);
  }

  async playMove(move: MoveRecord): Promise<void> {
    const drop = this.pendingDrop;
    this.pendingDrop = null;
    const dropped = drop && drop.from === move.from && drop.to === move.to ? drop.at : undefined;
    await this.pieces.playMove(move, dropped);
  }

  finishAnimations(): void {
    this.pieces.finish();
  }

  setMarks(marks: MoveMarks): void {
    this.setMark({ lastMove: marks.lastMove, check: marks.check, hint: marks.hint });
  }

  setInteractive(side: Color | null): void {
    this.enabled = side !== null;
    if (!this.enabled) {
      this.cancelDrag();
      this.select(null);
    }
  }

  // --- looks and layout ----------------------------------------------------------------------

  setLooks(board: BoardTheme, pieces: PieceTheme, table: TableTheme): void {
    this.looks = { board, table };
    this.colours = { w: pieceColours(pieces.w), b: pieceColours(pieces.b) };
    this.boardImages.clear();
    this.table = null;
    this.dirty = true;
  }

  setOptions(options: FlatOptions): void {
    if (options.showCoordinates !== this.options.showCoordinates) this.boardImages.clear();
    this.options = options;
    this.dirty = true;
  }

  setAids(aids: CoachMarks): void {
    this.setMark(aids);
  }

  /** The side seen at the bottom; the board turns, the figures stay upright. */
  setSide(side: Side): void {
    if (side === this.side) return;
    this.side = side;
    this.dirty = true;
  }

  /** How much of each window edge the interface covers. */
  setCovered(edges: Edges): void {
    const old = this.edges;
    const same = (['top', 'right', 'bottom', 'left'] as const).every(
      (edge) => Math.abs(edges[edge] - old[edge]) < 0.5,
    );
    if (same) return;
    this.edges = { ...edges };
    this.layout();
  }

  /** The middle of a square in client (CSS pixel) coordinates. */
  clientPoint(square: Square): { x: number; y: number } {
    const { x, z } = squareToWorld(square);
    const p = toScreen(x, z, this.side, this.rect);
    const box = this.canvas.getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }

  snapshot(): FlatSnapshot {
    return this.pieces.snapshot();
  }

  /** Paints the whole board now. */
  drawNow(): void {
    this.dirty = false;
    if (!this.looks || !this.colours || this.rect.size <= 0) return;
    const ctx = this.ctx;
    const { cx, cy, size } = this.rect;
    const cell = cellSize(this.rect);
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);

    ctx.fillStyle = this.tablePattern(cell) ?? this.looks.table.background;
    ctx.fillRect(0, 0, this.width, this.height);
    // A soft vignette, as the light falls off toward the edges of the 3D table.
    const reach = Math.hypot(this.width, this.height) / 2;
    const vignette = ctx.createRadialGradient(cx, cy, size * 0.45, cx, cy, reach);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    // The board, frame included, turned half a circle from Black's side. Shadow offsets ignore
    // the rotation, so it falls the same way from either side.
    ctx.save();
    ctx.translate(cx, cy);
    if (this.side === 'black') ctx.rotate(Math.PI);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = cell * 0.35;
    ctx.shadowOffsetY = cell * 0.08;
    ctx.drawImage(this.boardImage(), -size / 2, -size / 2, size, size);
    ctx.shadowColor = 'transparent';
    ctx.translate(-4 * cell, -4 * cell);
    paintMarks(
      ctx,
      this.marks,
      { showLegal: this.options.showLegalMoves, showLast: this.options.showLastMove },
      8 * cell,
    );
    ctx.restore();

    for (const figure of this.pieces.figuresToDraw()) {
      if (figure.scale <= 0.001) continue;
      const ground = toScreen(figure.x, figure.z, this.side, this.rect);
      const lift = Math.max(0, figure.lift);
      if (lift > 0.02) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.3, lift * 0.6)})`;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y + cell * 0.36, cell * 0.3, cell * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const box = cell * PIECE_BOX * figure.scale * (1 + lift * 0.18);
      const x = ground.x - box / 2;
      const y = ground.y - box * 0.52 - lift * cell * RAISE;
      drawPiece(ctx, figure.kind, this.colours[figure.color], x, y, box);
    }
  }

  // --- painting ------------------------------------------------------------------------------

  private boardImage(): HTMLCanvasElement {
    const pixels = Math.max(64, Math.round((this.rect.size * this.ratio) / 32) * 32);
    const key = `${this.side}|${pixels}`;
    let image = this.boardImages.get(key);
    if (image) return image;
    const board = this.looks!.board;
    image = document.createElement('canvas');
    image.width = pixels;
    image.height = pixels;
    drawFrameCanvas(
      image,
      FRAME,
      { side: this.side, visible: this.options.showCoordinates },
      board,
    );
    const unit = pixels / SPAN;
    drawSquares(image.getContext('2d')!, FRAME * unit, FRAME * unit, 8 * unit, board, createRng(7));
    // Keep at most both sides at the current size.
    if (this.boardImages.size >= 2) this.boardImages.clear();
    this.boardImages.set(key, image);
    return image;
  }

  private tablePattern(cell: number): CanvasPattern | null {
    if (!this.table) {
      const theme = this.looks!.table;
      const tile = document.createElement('canvas');
      tile.width = 512;
      tile.height = 512;
      const ctx = tile.getContext('2d')!;
      const rng = createRng(3);
      if (theme.pattern === 'cracked') drawCracked(ctx, 512, theme.surface, rng);
      else if (theme.pattern === 'felt') drawFelt(ctx, 512, theme.surface, rng);
      else drawGrain(ctx, 0, 0, 512, 512, theme.surface, rng);
      this.table = { tile, pattern: this.ctx.createPattern(tile, 'repeat') };
    }
    const pattern = this.table.pattern;
    pattern?.setTransform(new DOMMatrix().scale((TABLE_REPEAT * cell) / 512));
    return pattern;
  }

  private resize(): void {
    this.width = this.root.clientWidth;
    this.height = this.root.clientHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.width * this.ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * this.ratio));
    this.layout();
  }

  private layout(): void {
    this.rect = fitBoard(this.width, this.height, this.edges);
    this.dirty = true;
  }

  private setMark(patch: Partial<HighlightState>): void {
    this.marks = { ...this.marks, ...patch };
    this.dirty = true;
  }

  // --- input ---------------------------------------------------------------------------------

  private local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  private squareAt(event: { clientX: number; clientY: number }): Square | null {
    const p = this.local(event);
    const { x, z } = toBoard(p.x, p.y, this.side, this.rect);
    return worldToSquare(x, z);
  }

  private select(square: Square | null): void {
    this.selected = square;
    if (!square) {
      this.setMark({ selected: undefined, targets: [], captures: [], dropTarget: undefined });
      return;
    }
    const targets = this.rules.legalTargets(square);
    this.setMark({
      selected: square,
      targets,
      captures: targets.filter((t) => this.rules.isCapture(square, t)),
    });
  }

  private setCursor(square: Square | null): void {
    this.cursor = square;
    this.setMark({ cursor: square ?? undefined });
  }

  private async request(from: Square, to: Square, dropped?: BoardPoint): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.select(null);
    this.pendingDrop = dropped ? { from, to, at: dropped } : null;
    try {
      const accepted = await this.rules.move({ from, to });
      if (!accepted) {
        this.pendingDrop = null;
        await this.pieces.putBack(from);
        if (this.enabled && this.rules.canPick(from)) this.select(from);
      }
    } finally {
      this.busy = false;
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.busy) return;
    const square = this.squareAt(event);
    if (!square) {
      this.select(null);
      return;
    }
    if (!this.enabled) return;
    this.setCursor(null);
    if (
      this.selected &&
      this.selected !== square &&
      this.rules.legalTargets(this.selected).includes(square)
    ) {
      void this.request(this.selected, square);
      return;
    }
    if (this.rules.canPick(square)) {
      const wasSelected = this.selected === square;
      this.select(square);
      this.press = {
        pointerId: event.pointerId,
        square,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        wasSelected,
      };
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    } else {
      this.select(null);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) {
      if (event.pointerType === 'mouse' && event.buttons === 0) this.updateHoverCursor(event);
      return;
    }
    if (
      !press.dragging &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD
    )
      return;
    if (!press.dragging) {
      press.dragging = true;
      this.pieces.pickUp(press.square);
    }
    this.canvas.style.cursor = 'grabbing';
    const p = this.local(event);
    const point = toBoard(p.x, p.y, this.side, this.rect);
    const at = { x: clampBoard(point.x), z: clampBoard(point.z) };
    this.pieces.carry(press.square, at);
    const over = worldToSquare(at.x, at.z);
    const legal = over && this.rules.legalTargets(press.square).includes(over) ? over : undefined;
    if (legal !== this.marks.dropTarget) this.setMark({ dropTarget: legal });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.press = null;
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = '';
    this.setMark({ dropTarget: undefined });
    if (!press.dragging) {
      // A second click on the selected piece puts it down again.
      if (press.wasSelected) this.select(null);
      return;
    }
    const figure = this.pieces.get(press.square);
    const at = figure ? { x: figure.x, z: figure.z } : null;
    const target = at ? worldToSquare(at.x, at.z) : null;
    if (target && target !== press.square && at) {
      void this.request(press.square, target, at);
    } else {
      void this.pieces.putBack(press.square);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.press?.pointerId === event.pointerId) this.cancelDrag();
  };

  private cancelDrag(): void {
    const press = this.press;
    this.press = null;
    if (press?.dragging) void this.pieces.putBack(press.square);
  }

  private updateHoverCursor(event: PointerEvent): void {
    if (!this.enabled) {
      this.canvas.style.cursor = '';
      return;
    }
    const square = this.squareAt(event);
    const pickable =
      square &&
      (this.rules.canPick(square) ||
        (this.selected && this.rules.legalTargets(this.selected).includes(square)));
    this.canvas.style.cursor = pickable ? 'pointer' : '';
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.shown) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [role="menu"], dialog')) return;
    if (event.key === 'Escape') {
      this.select(null);
      this.setCursor(null);
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const step = arrows[event.key];
    if (step && event.shiftKey) {
      event.preventDefault();
      // Directions follow the viewer: from Black's side "up" goes toward rank 1.
      const flip = this.side === 'black' ? -1 : 1;
      const from = this.cursor ?? this.selected ?? (flip > 0 ? 'e2' : 'e7');
      const { file, rank } = squareIndices(from);
      const next = this.cursor
        ? squareFromIndices(file + step[0] * flip, rank + step[1] * flip)
        : from;
      if (next) this.setCursor(next);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.cursor && this.enabled) {
      event.preventDefault();
      const square = this.cursor;
      if (this.selected && this.rules.legalTargets(this.selected).includes(square)) {
        void this.request(this.selected, square);
      } else if (this.rules.canPick(square)) {
        this.select(this.selected === square ? null : square);
      }
    }
  };

  dispose(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.remove();
  }
}

function clampBoard(v: number): number {
  return Math.max(-4.3, Math.min(4.3, v));
}
