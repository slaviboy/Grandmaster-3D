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

// Turned-wood material for the pieces. The grain is a solid texture in the piece's own space:
// growth rings around a slightly tilted, off-centre vertical axis, warped by noise, plus fine long
// streaks. Like real turned wood, the sides show grain running up the piece and the tops show rings.
// The same idea drives the Blender preview material (blender/scripts/materials.py).

import {
  Color,
  MeshPhysicalMaterial,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { Color as Side } from '../game/types.ts';

export interface WoodStyle {
  readonly light: string;
  readonly dark: string;
  /** Rings per square from the axis. */
  readonly rings: number;
  /** 0..1: how strongly the dark latewood shows. */
  readonly contrast: number;
  readonly roughness: number;
  readonly clearcoat: number;
}

export const WOODS: Record<Side, WoodStyle> = {
  w: {
    light: '#d6b68e',
    dark: '#a97f55',
    rings: 13,
    contrast: 0.45,
    roughness: 0.42,
    clearcoat: 0.6,
  },
  b: {
    light: '#7f5c45',
    dark: '#463021',
    rings: 13,
    contrast: 0.5,
    roughness: 0.38,
    clearcoat: 0.7,
  },
};

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vWoodPosition;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform vec3 woodLight;
uniform vec3 woodDark;
uniform float woodRings;
uniform float woodContrast;
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
  // Distance from a tilted, off-centre growth axis.
  vec2 axis = vec2(0.13, -0.09) + p.y * vec2(0.06, 0.035);
  float warp = woodNoise(p * vec3(3.0, 0.8, 3.0)) * 0.9 + woodNoise(p * 9.0) * 0.25;
  float r = length(p.xz - axis) * woodRings + warp;
  // Saw-tooth rings: soft earlywood rising into a darker latewood band.
  float ring = fract(r);
  float late = smoothstep(0.55, 0.95, ring) * (1.0 - smoothstep(0.95, 1.0, ring));
  // Fine streaks running along the grain.
  float streak = woodNoise(vec3(p.x * 60.0, p.y * 3.0, p.z * 60.0));
  float t = clamp(late * woodContrast + (streak - 0.5) * 0.1 * woodContrast, 0.0, 1.0);
  return mix(woodLight, woodDark, t);
}
`;

/** A wood material for one piece; `seed` shifts its grain so no two pieces match. */
export function createWoodMaterial(side: Side, seed: number): MeshPhysicalMaterial {
  const style = WOODS[side];
  const material = new MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: style.roughness,
    metalness: 0,
    clearcoat: style.clearcoat,
    clearcoatRoughness: 0.16,
    specularIntensity: 0.6,
  });
  const uniforms = {
    woodLight: { value: new Color(style.light) },
    woodDark: { value: new Color(style.dark) },
    woodRings: { value: style.rings },
    woodContrast: { value: style.contrast },
    woodSeed: {
      value: new Vector3(
        Math.sin(seed * 12.9898) * 3.7,
        Math.sin(seed * 78.233) * 2.1,
        Math.sin(seed * 37.719) * 3.3,
      ),
    },
  };
  material.userData.wood = uniforms;
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
