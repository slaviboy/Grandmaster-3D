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

// Owns the renderer, the lights, the cloth and the render loop. Frames are drawn only when
// something changed or an animation is running, so an idle board costs nothing.

import {
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChessBoard } from './ChessBoard.ts';
import { createClothTexture } from './woodTextures.ts';

/** Called every frame with the elapsed seconds; returns true while it still needs frames. */
export type FrameUpdater = (deltaSeconds: number) => boolean;

const CLOTH_COLOUR = new Color('#154458');

export class ChessScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.5, 200);
  readonly board: ChessBoard;
  readonly keyLight: DirectionalLight;
  private readonly updaters = new Set<FrameUpdater>();
  private readonly resizeListeners = new Set<(width: number, height: number) => void>();
  private readonly timer = new Timer();
  private dirty = true;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'scene-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = CLOTH_COLOUR.clone();
    this.scene.fog = new Fog(CLOTH_COLOUR.clone(), 45, 90);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.15;
    pmrem.dispose();

    // Warm sky fill from above, cool bounce from the cloth below.
    this.scene.add(new HemisphereLight('#fff3e2', '#1d4a5c', 0.66));

    // Key light from the front right and above: shadows fall toward the back left.
    this.keyLight = new DirectionalLight('#fff6ea', 3.3);
    this.keyLight.position.set(8, 17, 5);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    const shadow = this.keyLight.shadow;
    shadow.mapSize.set(2048, 2048);
    shadow.camera.left = -7.5;
    shadow.camera.right = 7.5;
    shadow.camera.top = 7.5;
    shadow.camera.bottom = -7.5;
    shadow.camera.near = 4;
    shadow.camera.far = 40;
    shadow.radius = 4;
    shadow.bias = -0.0004;
    shadow.normalBias = 0.02;
    this.scene.add(this.keyLight, this.keyLight.target);

    // A soft light from the viewer's side, without shadows, so the front edge of the frame and the
    // fronts of the pieces are not lost in shade.
    const front = new DirectionalLight('#eaf2ff', 0.3);
    front.position.set(-2, 5, 14);
    this.scene.add(front);

    this.board = new ChessBoard();
    this.scene.add(this.board.group);

    const clothTexture = createClothTexture();
    clothTexture.repeat.set(10, 10);
    const cloth = new Mesh(
      new PlaneGeometry(120, 120),
      new MeshStandardMaterial({ map: clothTexture, roughness: 0.95, metalness: 0 }),
    );
    cloth.name = 'cloth';
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = this.board.bottomY - 0.001;
    cloth.receiveShadow = true;
    this.scene.add(cloth);
    this.scene.add(this.createContactShadow());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.timer.connect(document);
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  /** A blurred dark patch under the board: the soft drop shadow on the cloth in the reference. */
  private createContactShadow(): Mesh {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    const inset = size * 0.13;
    ctx.fillRect(inset, inset, size - 2 * inset, size - 2 * inset);
    const texture = new CanvasTexture(canvas);
    const shadow = new Mesh(
      new PlaneGeometry(11.6, 11.6),
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shadow.name = 'contact-shadow';
    shadow.rotation.x = -Math.PI / 2;
    // Slightly toward the viewer and to the right, away from the key light.
    shadow.position.set(0.25, this.board.bottomY + 0.002, 0.35);
    return shadow;
  }

  /** Registers a per-frame update; returns a function that removes it. */
  addUpdater(updater: FrameUpdater): () => void {
    this.updaters.add(updater);
    this.requestRender();
    return () => this.updaters.delete(updater);
  }

  onResize(listener: (width: number, height: number) => void): void {
    this.resizeListeners.add(listener);
    listener(this.width, this.height);
  }

  requestRender(): void {
    this.dirty = true;
  }

  get width(): number {
    return Math.max(1, this.container.clientWidth);
  }

  get height(): number {
    return Math.max(1, this.container.clientHeight);
  }

  /** Renders a frame now, regardless of the dirty flag (used before screenshots). */
  renderNow(): void {
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  private resize(): void {
    this.renderer.setSize(this.width, this.height, false);
    for (const listener of this.resizeListeners) listener(this.width, this.height);
    this.requestRender();
  }

  private tick(time: number): void {
    this.timer.update(time);
    const delta = Math.min(this.timer.getDelta(), 0.1);
    let active = false;
    for (const update of this.updaters) {
      if (update(delta)) active = true;
    }
    if (active || this.dirty) this.renderNow();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.timer.dispose();
    this.board.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
