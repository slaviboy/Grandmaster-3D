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

export type DragZone = 'corner' | 'edge';

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
const MAX_ELEVATION = 88 * DEG;
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
  private gestureStart: { distance: number; angle: number; centre: Vector2; view: View } | null =
    null;
  private zoneProvider: ZoneProvider = () => null;
  private width = 1;
  private height = 1;
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly settleListeners: Array<() => void> = [];
  private hoverZone: DragZone | null = null;
  enabled = true;

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
    // Keep the reference framing: same vertical field of view when the window is at least as wide
    // as the reference, and the same horizontal coverage when it is narrower.
    const halfTan = Math.tan((REFERENCE_VIEW.fov * DEG) / 2);
    const fit = aspect < REFERENCE_VIEW.aspect ? REFERENCE_VIEW.aspect / aspect : 1;
    this.camera.fov = (2 * Math.atan(halfTan * fit)) / DEG;
    const cosE = Math.cos(v.elevation);
    this.camera.position.set(
      v.targetX + Math.sin(v.azimuth) * cosE * v.distance,
      Math.sin(v.elevation) * v.distance,
      v.targetZ + Math.cos(v.azimuth) * cosE * v.distance,
    );
    this.camera.lookAt(v.targetX, 0, v.targetZ);
    // Shift the principal point as in the reference, so the board sits left of the side panel. On
    // narrow screens the panel moves away, so the board centres.
    const shiftX = aspect >= 1.1 ? -REFERENCE_VIEW.offsetX : 0;
    const shiftY = -REFERENCE_VIEW.offsetY;
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
    this.goal.azimuth = start.view.azimuth - (angle - start.angle);
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
