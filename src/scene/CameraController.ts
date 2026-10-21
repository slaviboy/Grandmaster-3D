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

// Orbits the camera around the board the way the classic game does: drag a board corner to rotate
// and tilt, drag the board edge to pan, use the wheel or PgUp/PgDn to zoom, and the arrow keys to
// rotate and tilt. Extras: right-drag anywhere rotates, two fingers twist, pinch and pan, and Home
// resets the view. Left clicks on squares and pieces are left alone for moves.

import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { REFERENCE_VIEW } from './referenceView.ts';

export interface ReferenceView {
  readonly fov: number;
  readonly elevation: number;
  readonly distance: number;
  readonly targetZ: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export type DragZone = 'corner' | 'edge';

/** Pixels along the canvas edges covered by the interface, which the board is framed clear of. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Tells the controller which camera zone (if any) lies under a client-space point. */
export type ZoneProvider = (clientX: number, clientY: number) => DragZone | null;

interface View {
  azimuth: number; // radians, 0 = camera on White's side (+z)
  elevation: number; // radians above the board plane
  distance: number;
  targetX: number;
  targetZ: number;
}

const DEG = Math.PI / 180;
const MIN_ELEVATION = 12 * DEG;
// Just short of straight down, where the camera's up direction would be undefined.
const MAX_ELEVATION = 89.5 * DEG;
/** Distance at which the whole board, frame included, fits the reference field of view. */
const TOP_DISTANCE = 21;
/** At the reference view the board, frame included, is this many screen heights wide... */
const BOARD_WIDE = 0.854;
/** ...and this many tall, up to the tops of the far kings. */
const BOARD_TALL = 0.625;
/** The part of the free space the framed board fills. */
const BOARD_FILL = 0.94;
const MIN_DISTANCE = 9;
const MAX_DISTANCE = 42;
const MAX_PAN = 3.5;
const ROTATE_PER_PIXEL = 0.35 * DEG;
const TILT_PER_PIXEL = 0.25 * DEG;
const KEY_ROTATE = 5 * DEG;
const KEY_TILT = 3 * DEG;
const SMOOTHING = 14;

function svgCursor(svg: string, x: number, y: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

// Original cursor art: a circular double arrow for rotating and a four-way arrow for panning.
const ROTATE_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14a8 8 0 0 1 14-5.3M22 14a8 8 0 0 1-14 5.3" stroke="#000" stroke-width="5"/><path d="M6 14a8 8 0 0 1 14-5.3M22 14a8 8 0 0 1-14 5.3" stroke="#fff" stroke-width="2.4"/><path d="M21 4v5h-5M7 24v-5h5" stroke="#000" stroke-width="5"/><path d="M21 4v5h-5M7 24v-5h5" stroke="#fff" stroke-width="2.4"/></g></svg>`,
  14,
  14,
  'grab',
);
const PAN_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v22M3 14h22M10 7l4-4 4 4M10 21l4 4 4-4M7 10l-4 4 4 4M21 10l4 4-4 4" stroke="#000" stroke-width="5"/><path d="M14 3v22M3 14h22M10 7l4-4 4 4M10 21l4 4 4-4M7 10l-4 4 4 4M21 10l4 4-4 4" stroke="#fff" stroke-width="2.2"/></g></svg>`,
  14,
  14,
  'move',
);

type Drag =
  | { kind: 'rotate'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'pan'; pointerId: number; anchor: Vector3 }
  | { kind: 'gesture' };

export class CameraController {
  private readonly current: View;
  private readonly goal: View;
  private readonly home: View;
  private drag: Drag | null = null;
  private readonly touches = new Map<number, Vector2>();
  /** A two-finger gesture: where it began, the fingers' last angle and the turn so far. */
  private gestureStart: {
    distance: number;
    angle: number;
    twist: number;
    centre: Vector2;
    view: View;
  } | null = null;
  private zoneProvider: ZoneProvider = () => null;
  private width = 1;
  private height = 1;
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly settleListeners: Array<() => void> = [];
  private hoverZone: DragZone | null = null;
  private reference: ReferenceView = REFERENCE_VIEW;
  private reserved: Insets = { top: 0, right: 0, bottom: 0 };
  enabled = true;
  /** A two-finger twist turns the board against the fingers, as the camera rather than the board. */
  reverseTwist = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly requestRender: () => void,
  ) {
    this.home = {
      azimuth: 0,
      elevation: REFERENCE_VIEW.elevation * DEG,
      distance: REFERENCE_VIEW.distance,
      targetX: 0,
      targetZ: REFERENCE_VIEW.targetZ,
    };
    this.current = { ...this.home };
    this.goal = { ...this.home };
    this.apply();

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
  }

  setZoneProvider(provider: ZoneProvider): void {
    this.zoneProvider = provider;
  }

  /** True while a camera drag or gesture is in progress, so moves can ignore those pointers. */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /** The cursor the camera wants for the current hover, or null when it has no opinion. */
  get cursor(): string | null {
    if (this.drag?.kind === 'rotate') return ROTATE_CURSOR;
    if (this.drag?.kind === 'pan') return PAN_CURSOR;
    if (this.hoverZone === 'corner') return ROTATE_CURSOR;
    if (this.hoverZone === 'edge') return PAN_CURSOR;
    return null;
  }

  /**
   * Replaces the calibrated view, for comparing against a screenshot taken with another camera
   * (development tool; null restores the default reference view).
   */
  useReferenceView(view: ReferenceView | null): void {
    this.reference = view ?? REFERENCE_VIEW;
    Object.assign(this.home, {
      elevation: this.reference.elevation * DEG,
      distance: this.reference.distance,
      targetX: 0,
      targetZ: this.reference.targetZ,
    });
    Object.assign(this.goal, this.home, { azimuth: this.goal.azimuth });
    Object.assign(this.current, this.goal);
    this.apply();
  }

  /**
   * Tells the camera how much of each edge the interface covers. Every call gives all three, so an
   * interface that is swapped out leaves nothing of its own behind.
   */
  setReserved(insets: Insets): void {
    const old = this.reserved;
    const same = (['top', 'right', 'bottom'] as const).every(
      (side) => Math.abs(insets[side] - old[side]) < 0.5,
    );
    if (same) return;
    this.reserved = { ...insets };
    this.apply();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.apply();
  }

  /** Per-frame easing toward the goal view; returns true while still moving. */
  update(delta: number): boolean {
    const k = 1 - Math.exp(-SMOOTHING * delta);
    let moving = false;
    for (const key of Object.keys(this.current) as Array<keyof View>) {
      const difference = this.goal[key] - this.current[key];
      if (Math.abs(difference) > 1e-4) {
        this.current[key] += difference * k;
        moving = true;
      } else {
        this.current[key] = this.goal[key];
      }
    }
    if (moving) this.apply();
    else this.notifySettled();
    return moving;
  }

  rotateBy(azimuth: number, elevation: number): void {
    this.goal.azimuth += azimuth;
    this.goal.elevation = clamp(this.goal.elevation + elevation, MIN_ELEVATION, MAX_ELEVATION);
    this.requestRender();
  }

  zoomBy(factor: number): void {
    this.goal.distance = clamp(this.goal.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    this.requestRender();
  }

  panTo(x: number, z: number): void {
    const length = Math.hypot(x, z);
    const scale = length > MAX_PAN ? MAX_PAN / length : 1;
    this.goal.targetX = x * scale;
    this.goal.targetZ = z * scale;
    this.requestRender();
  }

  /** Back to the reference view, keeping the side the player is looking from. */
  reset(): void {
    const side = Math.round(this.goal.azimuth / Math.PI) * Math.PI;
    Object.assign(this.goal, this.home, { azimuth: side });
    this.requestRender();
  }

  /**
   * Looks straight down on the board, the player's own side at the bottom; called again it goes
   * back to the reference view.
   */
  topView(): void {
    if (this.isTopView) {
      this.reset();
      return;
    }
    const side = Math.round(this.goal.azimuth / Math.PI) * Math.PI;
    Object.assign(this.goal, {
      azimuth: side,
      elevation: MAX_ELEVATION,
      distance: TOP_DISTANCE,
      targetX: 0,
      targetZ: 0,
    });
    this.requestRender();
  }

  /** Whether the camera is (heading to) looking straight down. */
  get isTopView(): boolean {
    return this.goal.elevation > MAX_ELEVATION - 0.5 * DEG;
  }

  /** Looks at the board from White's or Black's side, turning the short way round. */
  setOrientation(side: 'white' | 'black', animate = true): Promise<void> {
    const base = side === 'white' ? 0 : Math.PI;
    const turns = Math.round((this.goal.azimuth - base) / (2 * Math.PI));
    this.goal.azimuth = base + turns * 2 * Math.PI;
    if (!animate) {
      Object.assign(this.current, this.goal);
      this.apply();
      return Promise.resolve();
    }
    this.requestRender();
    return this.whenSettled();
  }

  /** Turns the camera half a circle to the other side of the board. */
  flip(): Promise<void> {
    this.goal.azimuth += Math.PI;
    this.requestRender();
    return this.whenSettled();
  }

  /** The player side the camera is currently closer to. */
  get side(): 'white' | 'black' {
    const a = ((this.current.azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return a > Math.PI / 2 && a < (3 * Math.PI) / 2 ? 'black' : 'white';
  }

  /** Projects a world point to client (CSS pixel) coordinates of the canvas. */
  projectToClient(point: Vector3): { x: number; y: number } {
    const p = point.clone().project(this.camera);
    const rect = this.dom.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }

  /** Normalised device coordinates of a client point, for raycasting. */
  toNdc(clientX: number, clientY: number, out = new Vector2()): Vector2 {
    const rect = this.dom.getBoundingClientRect();
    return out.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private whenSettled(): Promise<void> {
    return new Promise((resolve) => this.settleListeners.push(resolve));
  }

  private notifySettled(): void {
    while (this.settleListeners.length) this.settleListeners.shift()?.();
  }

  private apply(): void {
    const v = this.current;
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // Keep the reference framing: the same vertical field of view while the board still fits, and
    // a wider one on narrow screens so the whole board stays in view.
    // Keep the reference framing when the window is at least as wide as the reference (4:3). On
    // narrower windows, fit the board into the part of the screen the interface leaves free (left
    // of the side panels, or between the cards at the top and the dock at the bottom of a phone),
    // and centre it there.
    const reference = this.reference;
    const halfTan = Math.tan((reference.fov * DEG) / 2);
    let fit = 1;
    let shiftX = -reference.offsetX;
    let shiftY = -reference.offsetY;
    if (aspect < 1.3) {
      const { top, right, bottom } = this.reserved;
      const wide = Math.max(1, this.width - right);
      const tall = Math.max(1, this.height - top - bottom);
      fit = Math.max(
        1,
        (BOARD_WIDE * this.height) / (BOARD_FILL * wide),
        (BOARD_TALL * this.height) / (BOARD_FILL * tall),
      );
      shiftX = -((wide - this.width) / 2) / this.width;
      shiftY -= (top - bottom) / 2 / this.height;
    }
    this.camera.fov = (2 * Math.atan(halfTan * fit)) / DEG;
    const cosE = Math.cos(v.elevation);
    this.camera.position.set(
      v.targetX + Math.sin(v.azimuth) * cosE * v.distance,
      Math.sin(v.elevation) * v.distance,
      v.targetZ + Math.cos(v.azimuth) * cosE * v.distance,
    );
    this.camera.lookAt(v.targetX, 0, v.targetZ);
    this.camera.setViewOffset(
      this.width,
      this.height,
      shiftX * this.width,
      shiftY * this.height,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private groundPoint(clientX: number, clientY: number): Vector3 | null {
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new Vector3());
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (event.pointerType === 'touch') {
      this.touches.set(event.pointerId, new Vector2(event.clientX, event.clientY));
      if (this.touches.size === 2) {
        this.startGesture();
        event.preventDefault();
        return;
      }
    }
    if (this.drag) return;
    const zone =
      event.button === 2
        ? 'corner'
        : event.button === 0
          ? this.zoneProvider(event.clientX, event.clientY)
          : null;
    if (!zone) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.dom.setPointerCapture(event.pointerId);
    if (zone === 'corner') {
      this.drag = {
        kind: 'rotate',
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
    } else {
      const anchor = this.groundPoint(event.clientX, event.clientY);
      if (anchor) this.drag = { kind: 'pan', pointerId: event.pointerId, anchor };
    }
    this.updateCursor();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.touches.has(event.pointerId)) {
      this.touches.get(event.pointerId)?.set(event.clientX, event.clientY);
      if (this.drag?.kind === 'gesture') {
        this.updateGesture();
        return;
      }
    }
    const drag = this.drag;
    if (!drag) {
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        const zone = this.enabled ? this.zoneProvider(event.clientX, event.clientY) : null;
        if (zone !== this.hoverZone) {
          this.hoverZone = zone;
          this.updateCursor();
        }
      }
      return;
    }
    if (drag.kind === 'rotate' && event.pointerId === drag.pointerId) {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      this.rotateBy(-dx * ROTATE_PER_PIXEL, dy * TILT_PER_PIXEL);
    } else if (drag.kind === 'pan' && event.pointerId === drag.pointerId) {
      // Keep the grabbed point of the board under the pointer.
      const point = this.groundPoint(event.clientX, event.clientY);
      if (!point) return;
      this.panTo(
        this.goal.targetX + (drag.anchor.x - point.x),
        this.goal.targetZ + (drag.anchor.z - point.z),
      );
      // The camera moves instantly while panning so the anchor maths stays exact.
      this.current.targetX = this.goal.targetX;
      this.current.targetZ = this.goal.targetZ;
      this.apply();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId);
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === 'gesture') {
      if (this.touches.size < 2) {
        this.drag = null;
        this.gestureStart = null;
      }
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    if (this.dom.hasPointerCapture(event.pointerId))
      this.dom.releasePointerCapture(event.pointerId);
    this.drag = null;
    this.updateCursor();
  };

  private startGesture(): void {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return;
    this.drag = { kind: 'gesture' };
    this.gestureStart = {
      distance: a.distanceTo(b),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      twist: 0,
      centre: a.clone().add(b).multiplyScalar(0.5),
      view: { ...this.goal },
    };
  }

  private updateGesture(): void {
    const start = this.gestureStart;
    const [a, b] = [...this.touches.values()];
    if (!start || !a || !b) return;
    const distance = a.distanceTo(b);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const centre = a.clone().add(b).multiplyScalar(0.5);
    this.goal.distance = clamp(
      start.view.distance * (start.distance / Math.max(distance, 1)),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    // Added up step by step, each step the short way round: the line between the fingers crossing
    // the horizontal must not count as a full turn.
    start.twist += wrapAngle(angle - start.angle);
    start.angle = angle;
    // A larger azimuth turns the board clockwise on screen, the way a clockwise twist goes.
    this.goal.azimuth = start.view.azimuth + (this.reverseTwist ? -start.twist : start.twist);
    this.goal.elevation = clamp(
      start.view.elevation + (centre.y - start.centre.y) * TILT_PER_PIXEL,
      MIN_ELEVATION,
      MAX_ELEVATION,
    );
    // Horizontal two-finger movement pans sideways relative to the view.
    const sideways = -(centre.x - start.centre.x) * (this.goal.distance / this.height) * 0.6;
    this.panTo(
      start.view.targetX + Math.cos(this.goal.azimuth) * sideways,
      start.view.targetZ - Math.sin(this.goal.azimuth) * sideways,
    );
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.zoomBy(Math.exp(pixels * 0.0012));
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], dialog'))
      return;
    switch (event.key) {
      case 'ArrowLeft':
        this.rotateBy(KEY_ROTATE, 0);
        break;
      case 'ArrowRight':
        this.rotateBy(-KEY_ROTATE, 0);
        break;
      case 'ArrowUp':
        this.rotateBy(0, KEY_TILT);
        break;
      case 'ArrowDown':
        this.rotateBy(0, -KEY_TILT);
        break;
      case 'PageUp':
        this.zoomBy(0.9);
        break;
      case 'PageDown':
        this.zoomBy(1 / 0.9);
        break;
      case 'Home':
        this.reset();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  private updateCursor(): void {
    this.dom.style.cursor = this.cursor ?? '';
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('wheel', this.onWheel);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The same angle within half a turn of zero. */
function wrapAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}
