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

// Builds the game: the scene and camera, the Blender pieces, the board marks and animations, the
// engine, the controller and the interface, and wires them together. URL parameters for testing:
// ?fen=<FEN> start position, ?anim=0 instant animations, ?engine=off no computer, ?seed=<n>,
// ?difficulty=<id>, ?debug=1 installs window.__chessDebug.

import { Raycaster, Vector3 } from 'three';
import { SoundManager } from '../audio/SoundManager.ts';
import { FrameMonitor } from '../core/FrameMonitor.ts';
import { Store } from '../core/Store.ts';
import { checkConsistency } from '../dev/ConsistencyChecker.ts';
import { WorkerTransport } from '../engine/EngineTransport.ts';
import { isDifficultyId } from '../engine/difficulty.ts';
import { StockfishAdapter } from '../engine/StockfishAdapter.ts';
import { GameController } from '../game/GameController.ts';
import { loadSettings, saveSettings, type Settings } from '../game/Settings.ts';
import { AnimationController } from '../scene/AnimationController.ts';
import { Tweener } from '../scene/animation/tween.ts';
import { FragmentLibrary, ShatterEffect } from '../scene/effects/ShatterEffect.ts';
import { BoardView } from '../scene/BoardView.ts';
import { CameraController } from '../scene/CameraController.ts';
import { ChessScene } from '../scene/ChessScene.ts';
import { isSquare, squareToWorld, type Square } from '../scene/coords.ts';
import { Highlights } from '../scene/Highlights.ts';
import { InteractionController } from '../scene/InteractionController.ts';
import { PieceAssetManager } from '../scene/PieceAssetManager.ts';
import { PieceManager } from '../scene/PieceManager.ts';
import { setPieceEnvironment } from '../scene/pieceMaterial.ts';
import { boardTheme, pieceTheme, tableTheme } from '../scene/themes.ts';
import { askPromotion } from '../ui/PromotionDialog.ts';

export class App {
  readonly settings: Store<Settings>;
  readonly scene: ChessScene;
  readonly camera: CameraController;
  readonly tweener = new Tweener();
  readonly assets = new PieceAssetManager();
  readonly pieces: PieceManager;
  readonly highlights: Highlights;
  readonly animations: AnimationController;
  readonly view: BoardView;
  readonly fragments = new FragmentLibrary();
  readonly shatter: ShatterEffect;
  readonly interaction: InteractionController;
  readonly engine: StockfishAdapter | null;
  readonly sound: SoundManager;
  readonly controller: GameController;
  readonly ready: Promise<void>;
  private readonly params = new URLSearchParams(location.search);
  private readonly noticeListeners = new Set<(text: string) => void>();
  /** Frame times while animating, to spot glass that is too slow for this machine. */
  private readonly frames = new FrameMonitor();
  /** The automatic fallback turns glass reflections off at most once per session. */
  private glassFallbackUsed = false;

  constructor(readonly root: HTMLElement) {
    const initial = loadSettings();
    const difficultyParam = this.params.get('difficulty');
    this.settings = new Store<Settings>(
      difficultyParam && isDifficultyId(difficultyParam)
        ? { ...initial, difficulty: difficultyParam }
        : initial,
    );

    this.scene = new ChessScene(root);
    const requestRender = () => this.scene.requestRender();
    const canvas = this.scene.renderer.domElement;
    this.camera = new CameraController(this.scene.camera, canvas, requestRender);
    this.scene.onResize((w, h) => this.camera.resize(w, h));
    if (this.params.get('anim') === '0') this.tweener.speed = 0;

    setPieceEnvironment(this.scene.scene.environment, this.scene.surroundings.texture);
    this.pieces = new PieceManager(this.assets);
    this.scene.scene.add(this.pieces.group);
    this.highlights = new Highlights(requestRender);
    this.scene.scene.add(this.highlights.mesh);
    this.animations = new AnimationController(this.tweener, this.pieces, this.assets, () =>
      this.settings.get(),
    );
    this.view = new BoardView(this.pieces, this.animations, this.highlights, requestRender);
    this.shatter = new ShatterEffect(this.fragments, 99, (glass) =>
      this.sound.play(glass ? 'shatterGlass' : 'shatter'),
    );
    this.scene.scene.add(this.shatter.group);
    this.animations.effect = this.shatter;

    this.engine =
      this.params.get('engine') === 'off'
        ? null
        : new StockfishAdapter(
            () =>
              new WorkerTransport(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`),
          );
    this.sound = new SoundManager(this.settings.get().sound);
    const seed = Number(this.params.get('seed') ?? Date.now());

    this.controller = new GameController({
      engine: this.engine,
      view: this.view,
      ui: { askPromotion },
      sound: this.sound,
      settings: this.settings.get(),
      seed,
    });

    this.interaction = new InteractionController(
      canvas,
      this.scene.camera,
      this.camera,
      this.pieces,
      this.highlights,
      this.tweener,
      {
        canPick: (square) => this.controller.canPick(square),
        legalTargets: (square) => this.controller.legalTargets(square),
        isCapture: (from, to) =>
          this.controller.game.legalMoves(from).some((m) => m.to === to && m.capture),
        move: (input, dropped) => {
          if (dropped) this.view.noteDrop(input.from, input.to, dropped);
          return this.controller.playerMove(input);
        },
      },
      requestRender,
    );
    this.view.interaction = this.interaction;

    // A press on a piece or square is a move; only the bare frame belongs to the camera.
    const raycaster = new Raycaster();
    this.camera.setZoneProvider((x, y) => {
      if (this.interaction.isOverBoard(x, y)) return null;
      raycaster.setFromCamera(this.camera.toNdc(x, y), this.scene.camera);
      const hit = raycaster.intersectObject(this.scene.board.frame, false)[0];
      return hit ? this.scene.board.frameZone(hit.point) : null;
    });

    let labelSide = this.camera.side;
    this.scene.addUpdater((delta) => {
      const moving = this.camera.update(delta);
      if (this.camera.side !== labelSide) {
        labelSide = this.camera.side;
        this.scene.board.setLabels({ side: labelSide });
      }
      const animating = this.tweener.update(delta);
      const shattering = this.shatter.update(delta);
      this.controller.tick();
      const active = moving || animating || shattering;
      this.watchGlassSpeed(delta, active);
      return active;
    });

    // Apply looks only when they actually change: repainting costs a few milliseconds.
    let looks = { board: '', pieces: '', table: '', reflections: '' };
    this.settings.subscribe((s) => {
      const custom = JSON.stringify(s.custom);
      const next = {
        board: `${s.boardTheme}|${s.boardTheme === 'custom' ? custom : ''}`,
        pieces: `${s.pieceTheme}|${s.pieceTheme === 'custom' ? custom : ''}`,
        table: `${s.tableTheme}|${s.tableTheme === 'custom' ? custom : ''}`,
        reflections: String(s.glassReflections),
      };
      if (next.reflections !== looks.reflections) {
        this.scene.board.setReflections(s.glassReflections);
        this.assets.setGlassOptions({ transmission: s.glassReflections });
        // Clear glass pieces swap to the cheaper material (or back) at once.
        const theme = this.assets.currentTheme;
        const clear = theme.w.finish === 'glass' || theme.b.finish === 'glass';
        if (clear && next.pieces === looks.pieces && this.assets.ready) this.pieces.restyle();
      }
      if (next.board !== looks.board) {
        this.scene.setBoardTheme(boardTheme(s.boardTheme, s.custom));
        this.shatter.clothY = this.scene.board.bottomY;
      }
      if (next.table !== looks.table) this.scene.setTable(tableTheme(s.tableTheme, s.custom));
      if (next.pieces !== looks.pieces) {
        // A differently carved set loads first; restyle once its models are in use.
        void this.assets.setTheme(pieceTheme(s.pieceTheme, s.custom)).then(() => {
          if (!this.assets.ready) return;
          this.pieces.restyle();
          this.loadFragments();
          this.scene.requestRender();
        });
      }
      looks = next;
      this.scene.requestRender();
      saveSettings(s);
      this.sound.enabled = s.sound;
      if (this.params.get('anim') !== '0') this.tweener.speed = s.animationSpeed;
      this.highlights.setOptions({
        showLegalMoves: s.showLegalMoves,
        showLastMove: s.showLastMove,
      });
      this.scene.board.setLabels({ visible: s.showCoordinates });
      this.controller.updateSettings(s);
    });

    this.ready = this.start();
    if (import.meta.env.DEV || this.params.has('debug')) this.installDebugHook();
  }

  /** Short messages for the player (shown in the Chess Coach panel). */
  onNotice(listener: (text: string) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  private notice(text: string): void {
    for (const listener of this.noticeListeners) listener(text);
  }

  /**
   * Real glass costs extra rendering. If animations run slower than 40 frames a second while a
   * glass look uses it, turn the reflections off once and say so; the player can turn them back on.
   */
  private watchGlassSpeed(delta: number, active: boolean): void {
    const s = this.settings.get();
    const board = this.scene.board.currentTheme.construction === 'glass';
    const theme = this.assets.currentTheme;
    const pieces = theme.w.finish === 'glass' || theme.b.finish === 'glass';
    if (this.glassFallbackUsed || !s.glassReflections || !(board || pieces)) {
      this.frames.reset();
      return;
    }
    this.frames.record(delta, active);
    if (!this.frames.slow) return;
    this.glassFallbackUsed = true;
    // Frame times reach us capped at 0.1 s, so anything slower reads as "under 10".
    const median = this.frames.median;
    const rate = median >= 0.1 ? 'under 10' : String(Math.round(1 / median));
    this.frames.reset();
    this.settings.update({ glassReflections: false });
    this.notice(
      `Glass ran at ${rate} frames a second on this computer, so reflections are now off. ` +
        'Turn them back on under Preferences > Glass Reflections.',
    );
  }

  /** The fragments are only needed for the optional Demolish animation; load them in the background. */
  private loadFragments(): void {
    const shape = this.assets.currentShape;
    void this.fragments.load(import.meta.env.BASE_URL, shape).catch((error: Error) => {
      console.warn(`${shape} fragments unavailable, captures will simply vanish:`, error.message);
    });
  }

  private async start(): Promise<void> {
    const engineReady = this.engine?.init().catch((error: Error) => {
      console.error('engine failed to start:', error.message);
    });
    await this.assets.load(import.meta.env.BASE_URL);
    this.loadFragments();
    await engineReady;
    const s = this.settings.get();
    await this.camera.setOrientation(
      s.mode === 'computer' && s.humanColor === 'b' ? 'black' : 'white',
      false,
    );
    await this.controller.newGame(this.params.get('fen') ?? undefined);
  }

  /** Starts a new game with the given settings (side, mode, time, difficulty). */
  async newGame(patch: Partial<Settings> = {}, fen?: string): Promise<void> {
    const next = { ...this.settings.get(), ...patch };
    this.settings.set(next);
    const side = next.mode === 'computer' && next.humanColor === 'b' ? 'black' : 'white';
    void this.camera.setOrientation(side);
    await this.controller.newGame(fen);
  }

  /** Development and test helpers on window.__chessDebug. */
  private installDebugHook(): void {
    const scene = () => {
      const pieces = this.pieces.snapshot();
      const positions: Partial<Record<Square, { x: number; y: number; z: number }>> = {};
      for (const square of Object.keys(pieces) as Square[]) {
        const p = this.pieces.get(square)!.mesh.position;
        positions[square] = { x: p.x, y: p.y, z: p.z };
      }
      return { pieces, positions, meshCount: this.pieces.group.children.length };
    };
    (window as unknown as { __chessDebug: unknown }).__chessDebug = {
      app: this,
      ready: this.ready,
      fen: () => this.controller.game.fen(),
      state: () => this.controller.state.get(),
      phase: () => this.controller.currentPhase,
      history: () => this.controller.game.history().map((m) => m.san),
      pieceCount: () => this.pieces.group.children.length,
      snapshot: () => this.pieces.snapshot(),
      whenIdle: async () => {
        await this.controller.whenIdle();
        while (this.tweener.running) await new Promise((r) => setTimeout(r, 30));
      },
      squareToScreen: (square: string) => {
        if (!isSquare(square)) throw new Error(`bad square ${square}`);
        const { x, z } = squareToWorld(square);
        return this.camera.projectToClient(new Vector3(x, 0.05, z));
      },
      worldToScreen: (x: number, y: number, z: number) =>
        this.camera.projectToClient(new Vector3(x, y, z)),
      /** A screen point that picks the given square: on its piece, or on the open square. */
      clickPoint: (square: string) => {
        if (!isSquare(square)) throw new Error(`bad square ${square}`);
        const { x, z } = squareToWorld(square);
        const view = this.pieces.get(square);
        const tries: Array<[number, number, number]> = [];
        if (view) {
          const h = this.assets.height(view.kind);
          for (const f of [0.55, 0.75, 0.35, 0.9, 0.2]) tries.push([x, h * f, z]);
        }
        for (const [dx, dz] of [
          [0, 0],
          [0, 0.3],
          [-0.3, 0.3],
          [0.3, 0.3],
          [0, -0.3],
          [-0.3, 0],
          [0.3, 0],
        ]) {
          tries.push([x + dx!, 0.01, z + dz!]);
        }
        for (const [px, py, pz] of tries) {
          const point = this.camera.projectToClient(new Vector3(px, py, pz));
          if (this.interaction.squareAt(point.x, point.y) === square) return point;
        }
        return null;
      },
      consistency: () =>
        checkConsistency(this.controller.game.board(), scene(), {
          humanColor:
            this.settings.get().mode === 'computer' ? this.settings.get().humanColor : undefined,
          moves: this.controller.moveAudit(),
        }),
      newGame: (patch: Partial<Settings>, fen?: string) => this.newGame(patch, fen),
      setSettings: (patch: Partial<Settings>) => this.settings.update(patch),
      render: () => this.scene.renderNow(),
      theme: () => ({
        board: this.scene.board.currentTheme.id,
        pieces: this.assets.currentTheme.id,
        table: this.settings.get().tableTheme,
        whiteMaterial: (() => {
          const view =
            this.pieces.get('e1') ??
            [...Object.keys(this.pieces.snapshot())]
              .map((sq) => this.pieces.get(sq as Square))
              .find((v) => v?.color === 'w');
          const m = view?.mesh.material as
            | {
                metalness?: number;
                transmission?: number;
                userData?: { style?: { light?: string } };
              }
            | undefined;
          return m
            ? {
                metalness: m.metalness,
                transmission: m.transmission,
                light: m.userData?.style?.light,
              }
            : null;
        })(),
        /** Whether the glass board's mirror is showing (null without a glass board). */
        mirror: this.scene.scene.getObjectByName('glass-mirror')?.visible ?? null,
      }),
      cameraPosition: () =>
        this.scene.camera.position.toArray().map((v) => Math.round(v * 1000) / 1000),
      effectCount: () => this.shatter.group.children.length,
    };
  }
}
