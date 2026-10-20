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

import { Raycaster } from 'three';
import './styles/base.css';
import { boardFromFen } from './game/types.ts';
import { CameraController } from './scene/CameraController.ts';
import { ChessScene } from './scene/ChessScene.ts';
import { PieceAssetManager } from './scene/PieceAssetManager.ts';
import { PieceManager } from './scene/PieceManager.ts';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');

const chessScene = new ChessScene(app);
const camera = new CameraController(chessScene.camera, chessScene.renderer.domElement, () =>
  chessScene.requestRender(),
);
chessScene.onResize((width, height) => camera.resize(width, height));

const raycaster = new Raycaster();
camera.setZoneProvider((clientX, clientY) => {
  raycaster.setFromCamera(camera.toNdc(clientX, clientY), chessScene.camera);
  const hit = raycaster.intersectObject(chessScene.board.frame, false)[0];
  return hit ? chessScene.board.frameZone(hit.point) : null;
});

let labelSide = camera.side;
chessScene.addUpdater((delta) => {
  const moving = camera.update(delta);
  if (camera.side !== labelSide) {
    labelSide = camera.side;
    chessScene.board.setLabels({ side: labelSide });
  }
  return moving;
});

const assets = new PieceAssetManager();
const pieces = new PieceManager(assets);
chessScene.scene.add(pieces.group);
const params = new URLSearchParams(location.search);
assets
  .load(import.meta.env.BASE_URL)
  .then(() => {
    pieces.sync(boardFromFen(params.get('fen') ?? START_FEN));
    chessScene.requestRender();
  })
  .catch((error: Error) => console.error(error));
