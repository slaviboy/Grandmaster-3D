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

// Materials for the pieces, in four finishes. Wood and lacquer get a solid grain in the piece's
// own space: growth rings around a slightly tilted, off-centre vertical axis, warped by noise, with
// fine streaks along the grain, so the sides show grain running up the piece and the tops show
// rings, as on turned wood. Stone gets soft veins, metal a faint brushed sheen and strong
// reflections. The wood idea also drives the Blender preview material (blender/scripts/materials.py).

import {
  Color,
  MeshPhysicalMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { PieceFinish, PieceStyle } from './themes.ts';

const PATTERN: Record<PieceFinish, number> = { wood: 0, lacquer: 0, stone: 1, metal: 2 };

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vWoodPosition;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform vec3 woodLight;
uniform vec3 woodDark;
uniform float woodRings;
uniform float woodContrast;
uniform float woodPattern;
uniform vec3 woodSeed;
varying vec3 vWoodPosition;

float woodHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float woodNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(woodHash(i), woodHash(i + vec3(1, 0, 0)), f.x),
        mix(woodHash(i + vec3(0, 1, 0)), woodHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(woodHash(i + vec3(0, 0, 1)), woodHash(i + vec3(1, 0, 1)), f.x),
        mix(woodHash(i + vec3(0, 1, 1)), woodHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

vec3 woodColor(vec3 p) {
  p += woodSeed;
  float t;
  if (woodPattern < 0.5) {
    // Wood: distance from a tilted, off-centre growth axis gives the rings.
    vec2 axis = vec2(0.13, -0.09) + p.y * vec2(0.06, 0.035);
    float warp = woodNoise(p * vec3(3.0, 0.8, 3.0)) * 0.9 + woodNoise(p * 9.0) * 0.25;
    float r = length(p.xz - axis) * woodRings + warp;
    // Saw-tooth rings: soft earlywood rising into a darker latewood band.
    float ring = fract(r);
    float late = smoothstep(0.55, 0.95, ring) * (1.0 - smoothstep(0.95, 1.0, ring));
    // Fine streaks running along the grain.
    float streak = woodNoise(vec3(p.x * 60.0, p.y * 3.0, p.z * 60.0));
    t = late * woodContrast + (streak - 0.5) * 0.1 * woodContrast;
  } else if (woodPattern < 1.5) {
    // Stone: clouds of darker stone crossed by thin, warped veins.
    float cloud = woodNoise(p * 2.5) * 0.6 + woodNoise(p * 7.0) * 0.4;
    float warp = woodNoise(p * 3.0 + 7.1) * 4.0;
    float v = abs(sin((p.x * 0.8 + p.y * 0.6 + p.z) * woodRings + warp));
    float vein = 1.0 - smoothstep(0.0, 0.07, v);
    t = cloud * 0.5 * woodContrast + vein * woodContrast;
  } else {
    // Metal: a faint brushed sheen around the piece.
    float brush = woodNoise(vec3(p.x * 30.0, p.y * 400.0, p.z * 30.0));
    t = 0.5 + (brush - 0.5) * woodContrast;
  }
  return mix(woodLight, woodDark, clamp(t, 0.0, 1.0));
}
`;

/** A material for one piece in the given style; `seed` shifts its grain so no two pieces match. */
export function createPieceMaterial(style: PieceStyle, seed: number): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: style.roughness,
    metalness: style.metalness,
    clearcoat: style.clearcoat,
    clearcoatRoughness: style.finish === 'lacquer' ? 0.08 : 0.16,
    specularIntensity: 0.6,
    // The room reflection is kept faint for wood; polished metal needs more of it to read as metal.
    envMapIntensity: style.finish === 'metal' ? 6 : style.finish === 'stone' ? 1.6 : 1,
  });
  const uniforms = {
    woodLight: { value: new Color(style.light) },
    woodDark: { value: new Color(style.dark) },
    woodRings: { value: style.rings },
    woodContrast: { value: style.contrast },
    woodPattern: { value: PATTERN[style.finish] },
    woodSeed: {
      value: new Vector3(
        Math.sin(seed * 12.9898) * 3.7,
        Math.sin(seed * 78.233) * 2.1,
        Math.sin(seed * 37.719) * 3.3,
      ),
    },
  };
  material.userData.wood = uniforms;
  material.userData.style = style;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      VERTEX_DECLARATIONS +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWoodPosition = position;',
      );
    shader.fragmentShader =
      FRAGMENT_DECLARATIONS +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= woodColor(vWoodPosition);',
      );
  };
  // Every piece shares one compiled program; only the uniforms differ.
  material.customProgramCacheKey = () => 'turned-wood';
  return material;
}
