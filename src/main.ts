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
import { CameraController } from './scene/CameraController.ts';
import { ChessScene } from './scene/ChessScene.ts';

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
