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

// The default camera, fitted by scripts/calibrate-camera.ts to points measured on the reference
// screenshot (0.80 px rms error at 587x440). Angles in degrees, lengths in squares.
export const REFERENCE_VIEW = {
  /** Vertical field of view at the reference aspect ratio. */
  fov: 30.486,
  /** Camera height above the board plane, as an angle. */
  elevation: 49.674,
  distance: 22.059,
  /** The camera looks at (0, 0, targetZ): slightly toward White. */
  targetZ: 0.225,
  /** Principal-point shift as a fraction of the frame; negative x moves the board left. */
  offsetX: -0.04,
  offsetY: -0.0091,
  /** The reference frame is 587x440. */
  aspect: 587 / 440,
} as const;
