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

// The looks the player can choose: board, piece set and table presets, plus a Custom choice of
// each built from the player's own colours. The defaults are the look measured on the main
// reference; Mahogany, Marble, Red Lacquer & Silver and Blue Stone follow the other references.

export type SurfacePattern = 'wood' | 'marble' | 'plain';

/** How a flat surface is painted: wood grain, marble veins or a plain finish. */
export interface SurfaceStyle {
  readonly pattern: SurfacePattern;
  readonly base: string;
  /** Darker grain or vein colour, as "r,g,b". */
  readonly line: string;
  /** Lighter figure colour, as "r,g,b". */
  readonly highlight: string;
  readonly density: number;
  readonly contrast: number;
  readonly waviness: number;
}

export interface BoardTheme {
  readonly id: string;
  readonly label: string;
  readonly light: SurfaceStyle;
  readonly dark: SurfaceStyle;
  readonly frame: SurfaceStyle;
  /** Fill of the engraved coordinates. */
  readonly labelColour: string;
  /** The darker edge drawn above-left of each engraved letter. */
  readonly labelShadow: string;
  /** Multiplier on the frame's side walls. */
  readonly edgeTint: readonly [number, number, number];
  readonly roughness: number;
}

/** wood, lacquer, metal and stone are opaque; glass is clear and lets light through; gloss is
 * opaque polished glass (the black pieces of a glass set). */
export type PieceFinish = 'wood' | 'lacquer' | 'metal' | 'stone' | 'glass' | 'gloss';

export interface PieceStyle {
  readonly finish: PieceFinish;
  readonly light: string;
  readonly dark: string;
  /** Rings (wood) or veins (stone) per square. */
  readonly rings: number;
  readonly contrast: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat: number;
  /** Colour of the inside, shown on the cut faces when a piece shatters. */
  readonly endGrain: string;
}

export interface PieceTheme {
  readonly id: string;
  readonly label: string;
  readonly w: PieceStyle;
  readonly b: PieceStyle;
}

export type TablePattern = 'grain' | 'cracked' | 'felt';

export interface TableTheme {
  readonly id: string;
  readonly label: string;
  readonly pattern: TablePattern;
  readonly surface: SurfaceStyle;
  /** Colour behind and beyond the table (clear colour and fog). */
  readonly background: string;
}

/** The player's own colours for the Custom choices. */
export interface CustomColours {
  readonly light: string;
  readonly dark: string;
  readonly frame: string;
  readonly boardPattern: SurfacePattern;
  readonly white: string;
  readonly black: string;
  readonly finish: PieceFinish;
  readonly table: string;
}

export const DEFAULT_CUSTOM: CustomColours = {
  light: '#efe2cf',
  dark: '#7a8f5a',
  frame: '#8a5a3a',
  boardPattern: 'wood',
  white: '#e8e0d0',
  black: '#3a3a48',
  finish: 'lacquer',
  table: '#2d3e50',
};

const wood = (
  base: string,
  line: string,
  highlight: string,
  density = 22,
  contrast = 0.55,
  waviness = 3,
): SurfaceStyle => ({
  pattern: 'wood',
  base,
  line,
  highlight,
  density,
  contrast,
  waviness,
});

const marble = (base: string, line: string, highlight: string, contrast = 0.6): SurfaceStyle => ({
  pattern: 'marble',
  base,
  line,
  highlight,
  density: 7,
  contrast,
  waviness: 30,
});

const plain = (base: string, line: string, highlight: string): SurfaceStyle => ({
  pattern: 'plain',
  base,
  line,
  highlight,
  density: 0,
  contrast: 0.25,
  waviness: 0,
});

const WARM_LABEL = { labelColour: 'rgba(255,236,206,0.88)', labelShadow: 'rgba(120,64,20,0.35)' };

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: 'classic',
    label: 'Classic Maple',
    light: wood('#f2c48f', '176,120,64', '255,236,200', 22, 0.55, 3),
    dark: wood('#a47a4f', '110,66,28', '222,170,110', 24, 0.65, 3),
    frame: wood('#c8955b', '168,98,40', '255,212,150', 16, 0.6, 5),
    ...WARM_LABEL,
    edgeTint: [1.14, 1.08, 1.3],
    roughness: 0.55,
  },
  {
    id: 'mahogany',
    label: 'Mahogany',
    light: wood('#efe4d8', '196,160,128', '255,248,236', 18, 0.45, 3),
    dark: wood('#866062', '82,48,50', '182,138,138', 24, 0.6, 3),
    frame: wood('#88605e', '72,40,40', '182,136,134', 16, 0.65, 5),
    labelColour: 'rgba(248,226,214,0.85)',
    labelShadow: 'rgba(60,20,14,0.4)',
    edgeTint: [1.1, 1.0, 1.05],
    roughness: 0.5,
  },
  {
    id: 'marble',
    label: 'Marble',
    light: marble('#d6e2e3', '120,140,146', '250,255,255', 0.75),
    dark: marble('#9fb2b5', '74,92,98', '214,226,228', 0.8),
    frame: marble('#d9e4e6', '128,146,152', '252,255,255', 0.5),
    labelColour: 'rgba(160,178,184,0.75)',
    labelShadow: 'rgba(255,255,255,0.4)',
    edgeTint: [1.0, 1.0, 1.04],
    roughness: 0.3,
  },
  {
    id: 'walnut',
    label: 'Walnut & Birch',
    light: wood('#ead6b0', '186,156,108', '255,246,222', 20, 0.45, 3),
    dark: wood('#6a4a32', '44,26,14', '140,104,74', 26, 0.7, 4),
    frame: wood('#5c3e28', '36,20,10', '128,92,62', 16, 0.7, 5),
    labelColour: 'rgba(240,222,190,0.85)',
    labelShadow: 'rgba(20,10,4,0.45)',
    edgeTint: [1.1, 1.04, 1.04],
    roughness: 0.5,
  },
  {
    id: 'ebony',
    label: 'Ebony & Boxwood',
    light: wood('#efd9a8', '196,160,96', '255,248,220', 20, 0.4, 3),
    dark: wood('#2c2522', '10,8,6', '84,72,64', 26, 0.6, 3),
    frame: wood('#2a2321', '8,6,4', '80,68,60', 18, 0.6, 5),
    labelColour: 'rgba(236,214,170,0.85)',
    labelShadow: 'rgba(0,0,0,0.5)',
    edgeTint: [1.2, 1.15, 1.15],
    roughness: 0.35,
  },
  {
    id: 'tournament',
    label: 'Tournament Green',
    light: plain('#ecebd2', '200,198,170', '255,255,240'),
    dark: plain('#5f8a4f', '62,96,48', '132,170,112'),
    frame: wood('#d2a874', '168,118,62', '250,224,180', 16, 0.5, 5),
    ...WARM_LABEL,
    edgeTint: [1.12, 1.06, 1.15],
    roughness: 0.6,
  },
];

const lacquerEnd = '#e4c8a0';

export const PIECE_THEMES: readonly PieceTheme[] = [
  {
    id: 'classic',
    label: 'Boxwood & Rosewood',
    w: {
      finish: 'wood',
      light: '#d6b68e',
      dark: '#a97f55',
      rings: 13,
      contrast: 0.45,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      endGrain: '#dcbb92',
    },
    b: {
      finish: 'wood',
      light: '#7f5c45',
      dark: '#463021',
      rings: 13,
      contrast: 0.5,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.7,
      endGrain: '#b8916a',
    },
  },
  {
    id: 'lacquer-silver',
    label: 'Red Lacquer & Silver',
    w: {
      finish: 'metal',
      light: '#c4d0dc',
      dark: '#93a2b4',
      rings: 0,
      contrast: 0.3,
      roughness: 0.36,
      metalness: 0.55,
      clearcoat: 0.3,
      endGrain: '#c8ced4',
    },
    b: {
      finish: 'lacquer',
      light: '#74291a',
      dark: '#3a0f08',
      rings: 11,
      contrast: 0.35,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.9,
      endGrain: lacquerEnd,
    },
  },
  {
    id: 'ebony',
    label: 'Ebony & Boxwood',
    w: {
      finish: 'wood',
      light: '#e6cc98',
      dark: '#c09a62',
      rings: 14,
      contrast: 0.4,
      roughness: 0.4,
      metalness: 0,
      clearcoat: 0.6,
      endGrain: '#ecd6a8',
    },
    b: {
      finish: 'wood',
      light: '#3a302b',
      dark: '#15100d',
      rings: 16,
      contrast: 0.45,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.8,
      endGrain: '#8a6a52',
    },
  },
  {
    id: 'walnut-maple',
    label: 'Walnut & Maple',
    w: {
      finish: 'wood',
      light: '#ecd8b4',
      dark: '#cbae80',
      rings: 12,
      contrast: 0.4,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.55,
      endGrain: '#f0dfc0',
    },
    b: {
      finish: 'wood',
      light: '#8a6446',
      dark: '#53382a',
      rings: 12,
      contrast: 0.55,
      roughness: 0.4,
      metalness: 0,
      clearcoat: 0.65,
      endGrain: '#c49c78',
    },
  },
  {
    id: 'ivory-onyx',
    label: 'Ivory & Onyx',
    w: {
      finish: 'stone',
      light: '#f2ebda',
      dark: '#d6c9ad',
      rings: 5,
      contrast: 0.25,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 0.8,
      endGrain: '#f4eee0',
    },
    b: {
      finish: 'stone',
      light: '#2c2b30',
      dark: '#121115',
      rings: 5,
      contrast: 0.35,
      roughness: 0.18,
      metalness: 0,
      clearcoat: 0.9,
      endGrain: '#4a484f',
    },
  },
  {
    id: 'gold-silver',
    label: 'Gold & Silver',
    w: {
      finish: 'metal',
      light: '#e8c66a',
      dark: '#b08a34',
      rings: 0,
      contrast: 0.3,
      roughness: 0.28,
      metalness: 0.95,
      clearcoat: 0.3,
      endGrain: '#f0d890',
    },
    b: {
      finish: 'metal',
      light: '#d6dce4',
      dark: '#a2aab4',
      rings: 0,
      contrast: 0.3,
      roughness: 0.3,
      metalness: 0.95,
      clearcoat: 0.3,
      endGrain: '#c0c6cc',
    },
  },
  {
    id: 'marble',
    label: 'Marble',
    w: {
      finish: 'stone',
      light: '#ecebe6',
      dark: '#b8b6b0',
      rings: 6,
      contrast: 0.55,
      roughness: 0.25,
      metalness: 0,
      clearcoat: 0.7,
      endGrain: '#f2f1ec',
    },
    b: {
      finish: 'stone',
      light: '#4a4848',
      dark: '#1a1919',
      rings: 6,
      contrast: 0.6,
      roughness: 0.25,
      metalness: 0,
      clearcoat: 0.7,
      endGrain: '#6a6868',
    },
  },
  {
    id: 'glass',
    label: 'Glass',
    w: {
      finish: 'glass',
      light: '#f6faf8',
      dark: '#dce8e2',
      rings: 0,
      contrast: 0,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 0,
      endGrain: '#eef4f2',
    },
    b: {
      finish: 'gloss',
      light: '#0b0d10',
      dark: '#050608',
      rings: 0,
      contrast: 0,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      endGrain: '#1c1f24',
    },
  },
];

export const TABLE_THEMES: readonly TableTheme[] = [
  {
    id: 'teal',
    label: 'Teal Cloth',
    pattern: 'grain',
    surface: wood('#1c4053', '8,36,50', '40,100,124', 30, 0.9, 9),
    background: '#154458',
  },
  {
    id: 'blue-stone',
    label: 'Blue Stone',
    pattern: 'cracked',
    surface: {
      pattern: 'plain',
      base: '#0c4058',
      line: '1,26,38',
      highlight: '58,124,148',
      density: 0,
      contrast: 0.9,
      waviness: 0,
    },
    background: '#0a3448',
  },
  {
    id: 'slate',
    label: 'Slate',
    pattern: 'cracked',
    surface: {
      pattern: 'plain',
      base: '#3a4046',
      line: '18,20,24',
      highlight: '96,104,112',
      density: 0,
      contrast: 0.7,
      waviness: 0,
    },
    background: '#2a2f34',
  },
  {
    id: 'felt',
    label: 'Green Felt',
    pattern: 'felt',
    surface: {
      pattern: 'plain',
      base: '#1f5a36',
      line: '10,40,22',
      highlight: '60,120,80',
      density: 0,
      contrast: 0.6,
      waviness: 0,
    },
    background: '#184a2c',
  },
  {
    id: 'burgundy',
    label: 'Burgundy',
    pattern: 'felt',
    surface: {
      pattern: 'plain',
      base: '#5a1a24',
      line: '34,8,12',
      highlight: '120,48,60',
      density: 0,
      contrast: 0.6,
      waviness: 0,
    },
    background: '#4a141c',
  },
];

export const DEFAULT_BOARD = 'classic';
export const DEFAULT_PIECES = 'classic';
export const DEFAULT_TABLE = 'teal';
export const CUSTOM_ID = 'custom';

// --- colour helpers ------------------------------------------------------------------------------

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v!)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h =
    max === rr
      ? (gg - bb) / d + (gg < bb ? 6 : 0)
      : max === gg
        ? (bb - rr) / d + 2
        : (rr - gg) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/** A lighter or darker shade of a colour (amount in lightness, -1..1). */
export function shade(hex: string, amount: number, saturate = 0): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(
    hslToRgb([h, Math.min(1, Math.max(0, s + saturate)), Math.min(1, Math.max(0, l + amount))]),
  );
}

function rgbString(hex: string): string {
  return hexToRgb(hex).join(',');
}

/** A believable surface from one picked colour: grain or veins in darker and lighter shades. */
export function surfaceFrom(base: string, pattern: SurfacePattern): SurfaceStyle {
  const line = rgbString(shade(base, -0.22, 0.05));
  const highlight = rgbString(shade(base, 0.14));
  if (pattern === 'marble') return marble(base, line, highlight);
  if (pattern === 'plain') return plain(base, line, highlight);
  return wood(base, line, highlight, 22, 0.6, 3);
}

function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

// --- resolving the chosen themes -----------------------------------------------------------------

export function boardTheme(id: string, custom: CustomColours = DEFAULT_CUSTOM): BoardTheme {
  if (id === CUSTOM_ID) {
    const frameLight = isLight(custom.frame);
    return {
      id: CUSTOM_ID,
      label: 'Custom',
      light: surfaceFrom(custom.light, custom.boardPattern),
      dark: surfaceFrom(custom.dark, custom.boardPattern),
      frame: surfaceFrom(custom.frame, custom.boardPattern),
      labelColour: frameLight ? 'rgba(40,30,20,0.6)' : 'rgba(255,244,226,0.85)',
      labelShadow: frameLight ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)',
      edgeTint: [1.1, 1.05, 1.08],
      roughness: custom.boardPattern === 'marble' ? 0.3 : 0.5,
    };
  }
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0]!;
}

function pieceStyleFrom(colour: string, finish: PieceFinish): PieceStyle {
  const light = shade(colour, 0.06);
  const dark = shade(colour, -0.16);
  const endGrain = shade(colour, 0.22, -0.1);
  switch (finish) {
    case 'glass':
      // The picked colour tints the glass.
      return {
        finish,
        light: shade(colour, 0.1),
        dark: colour,
        rings: 0,
        contrast: 0,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 0,
        endGrain: shade(colour, 0.15),
      };
    case 'gloss':
      return {
        finish,
        light: colour,
        dark: shade(colour, -0.1),
        rings: 0,
        contrast: 0,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        endGrain: shade(colour, 0.12),
      };
    case 'metal':
      return {
        finish,
        light,
        dark,
        rings: 0,
        contrast: 0.3,
        roughness: 0.3,
        metalness: 0.9,
        clearcoat: 0.25,
        endGrain,
      };
    case 'stone':
      return {
        finish,
        light,
        dark,
        rings: 6,
        contrast: 0.45,
        roughness: 0.22,
        metalness: 0,
        clearcoat: 0.8,
        endGrain,
      };
    case 'lacquer':
      return {
        finish,
        light,
        dark,
        rings: 11,
        contrast: 0.3,
        roughness: 0.3,
        metalness: 0,
        clearcoat: 0.9,
        endGrain,
      };
    default:
      return {
        finish,
        light,
        dark,
        rings: 13,
        contrast: 0.5,
        roughness: 0.4,
        metalness: 0,
        clearcoat: 0.6,
        endGrain,
      };
  }
}

export function pieceTheme(id: string, custom: CustomColours = DEFAULT_CUSTOM): PieceTheme {
  if (id === CUSTOM_ID) {
    return {
      id: CUSTOM_ID,
      label: 'Custom',
      w: pieceStyleFrom(custom.white, custom.finish),
      b: pieceStyleFrom(custom.black, custom.finish),
    };
  }
  return PIECE_THEMES.find((t) => t.id === id) ?? PIECE_THEMES[0]!;
}

export function tableTheme(id: string, custom: CustomColours = DEFAULT_CUSTOM): TableTheme {
  if (id === CUSTOM_ID) {
    const surface = surfaceFrom(custom.table, 'plain');
    return {
      id: CUSTOM_ID,
      label: 'Custom',
      pattern: 'felt',
      surface: { ...surface, contrast: 0.6 },
      background: shade(custom.table, -0.05),
    };
  }
  return TABLE_THEMES.find((t) => t.id === id) ?? TABLE_THEMES[0]!;
}

export function isBoardThemeId(id: unknown): id is string {
  return id === CUSTOM_ID || BOARD_THEMES.some((t) => t.id === id);
}

export function isPieceThemeId(id: unknown): id is string {
  return id === CUSTOM_ID || PIECE_THEMES.some((t) => t.id === id);
}

export function isTableThemeId(id: unknown): id is string {
  return id === CUSTOM_ID || TABLE_THEMES.some((t) => t.id === id);
}
