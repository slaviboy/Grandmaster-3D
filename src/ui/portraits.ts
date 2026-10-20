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

// Original player portraits for the Game Status panel: a dark silhouette for a human player and a
// carved wooden king for the computer.

export function humanPortrait(id: string): string {
  return `<svg viewBox="0 0 64 80" aria-hidden="true"><defs><radialGradient id="${id}" cx="0.45" cy="0.3" r="0.9"><stop offset="0" stop-color="#bfe4f2"/><stop offset="0.55" stop-color="#5aa4c4"/><stop offset="1" stop-color="#1d5d7c"/></radialGradient></defs><rect width="64" height="80" fill="url(#${id})"/><path d="M32 14c8.6 0 14 6.6 14 15.4 0 6.2-2.6 11.6-6.3 14.6l.3 3.8c9.4 2.6 17 8.2 19.5 16.2l1.5 16H-1l1.5-16C3 56 10.6 50.4 20 47.8l.3-3.8C16.6 41 14 35.6 14 29.4 14 20.6 23.4 14 32 14z" fill="#05090c"/></svg>`;
}

export function computerPortrait(id: string): string {
  return `<svg viewBox="0 0 64 80" aria-hidden="true"><defs><radialGradient id="${id}-bg" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="#2f7d98"/><stop offset="1" stop-color="#062b3b"/></radialGradient><linearGradient id="${id}-wood" x1="0" x2="1"><stop offset="0" stop-color="#6b3f22"/><stop offset="0.4" stop-color="#d29a62"/><stop offset="0.62" stop-color="#f1c890"/><stop offset="1" stop-color="#7a4a28"/></linearGradient></defs><rect width="64" height="80" fill="url(#${id}-bg)"/><g fill="url(#${id}-wood)" stroke="#3a210f" stroke-width="0.8"><path d="M29.6 6h4.8v4.4h4.4v4.6h-4.4v4.4h-4.8V15h-4.4v-4.6h4.4z"/><path d="M22 22c2.8-2.2 6.4-3 10-3s7.2.8 10 3c2.6 2 2.8 5.4.8 8.4L39.6 35H24.4l-3.2-4.6c-2-3-1.8-6.4.8-8.4z"/><path d="M21 36h22l-1.2 3.2H22.2zM24.6 40.4h14.8c-.6 8.4.2 16.6 3.4 23.6H21.2c3.2-7 4-15.2 3.4-23.6z"/><path d="M15 65h34c2 0 3.4 1.6 3.4 3.6V74H11.6v-5.4c0-2 1.4-3.6 3.4-3.6z"/></g><path d="M30 42c-.6 7.4 0 14.6 1.6 21" stroke="#fff3d8" stroke-opacity="0.45" stroke-width="2" fill="none"/></svg>`;
}
