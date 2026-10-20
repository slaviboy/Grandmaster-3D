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

// Glass for the glass look: clear pieces that let the board show through, mirror-black polished
// pieces, and the soft contact shadow clear glass gets instead of a solid one.

import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  type Object3D,
} from 'three';
import type { PieceStyle } from './themes.ts';

export interface GlassOptions {
  /** Real transmission (refraction of what is behind). Off = a cheaper see-through look. */
  readonly transmission: boolean;
}

/** Clear glass, slightly tinted by thickness like soda glass. */
export function clearGlassMaterial(style: PieceStyle, options: GlassOptions): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: style.light,
    metalness: 0,
    roughness: style.roughness,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 2.6,
    clearcoat: 0.4,
    clearcoatRoughness: 0.05,
  });
  if (options.transmission) {
    material.transmission = 1;
    material.thickness = 0.35;
    material.attenuationColor = new Color(style.dark);
    material.attenuationDistance = 2;
  } else {
    material.transparent = true;
    material.opacity = 0.42;
    material.depthWrite = false;
    material.roughness = Math.max(0.08, style.roughness);
  }
  material.userData.style = style;
  return material;
}

/** Opaque polished glass: black with mirror-sharp highlights. */
export function glossGlassMaterial(style: PieceStyle): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: style.light,
    metalness: 0,
    roughness: style.roughness,
    clearcoat: style.clearcoat,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 0.9,
  });
  material.userData.style = style;
  return material;
}

let blobTexture: CanvasTexture | null = null;

function contactTexture(): CanvasTexture {
  if (blobTexture) return blobTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  blobTexture = new CanvasTexture(canvas);
  return blobTexture;
}

const BLOB = 'contact-blob';

/**
 * Gives a clear-glass piece a soft, faint shadow on the board under it instead of a solid shadow.
 * The blob stays on the board and fades as the piece lifts.
 */
export function attachContactBlob(mesh: Mesh, radius: number): void {
  if (mesh.getObjectByName(BLOB)) return;
  const material = new MeshBasicMaterial({
    map: contactTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.55,
  });
  const blob = new Mesh(new PlaneGeometry(radius * 2.6, radius * 2.6), material);
  blob.name = BLOB;
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;
  blob.onBeforeRender = () => {
    const lift = mesh.position.y;
    blob.position.y = 0.004 - lift;
    material.opacity = 0.55 * Math.max(0, 1 - lift * 2.5);
  };
  mesh.add(blob);
}

export function detachContactBlob(mesh: Object3D): void {
  const blob = mesh.getObjectByName(BLOB) as Mesh | undefined;
  if (!blob) return;
  blob.removeFromParent();
  blob.geometry.dispose();
  (blob.material as MeshBasicMaterial).dispose();
}
