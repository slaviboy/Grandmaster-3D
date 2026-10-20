# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Turned-wood profiles of the classic Staunton set, in board squares.

Each profile is a list of (radius, height, sharp) control points from the centre of the underside,
out along the base, up the piece and back to the axis at the top. Points marked sharp are corners;
the rest are joined by a smooth curve. Heights were measured on the reference screenshots with the
calibrated camera: king 1.745, queen 1.63, bishop 1.36, knight 1.30, rook 0.93 and pawn 0.83
squares tall. (For the flat-topped rook and the ball-headed pawn the highest point on screen is the
far rim, not the centre, which the measurement accounts for.)
"""

HEIGHTS = {
    "king": 1.745,
    "queen": 1.63,
    "bishop": 1.36,
    "knight": 1.30,
    "rook": 0.93,
    "pawn": 0.83,
}

# Measured base widths on the reference are narrower than a classic tournament set: the profiles
# below are drawn at classic proportions and then narrowed by these factors when lathed.
RADIAL_SCALE = {
    "king": 0.83,
    "queen": 0.85,
    "bishop": 0.93,
    "knight": 0.94,
    "rook": 0.91,
    "pawn": 1.0,
}

BASE_RADIUS = {
    "king": 0.37,
    "queen": 0.36,
    "bishop": 0.31,
    "knight": 0.31,
    "rook": 0.33,
    "pawn": 0.26,
}


def base(r, h=1.0):
    """The ringed foot shared by every piece: a rounded bottom torus, a fine bead, then a groove.

    `r` is the base radius; `h` scales the foot's height.
    """
    return [
        (0.0, 0.0, True),
        (r * 0.97, 0.0, True),
        (r, 0.018 * h),
        (r * 0.99, 0.045 * h),
        (r * 0.94, 0.072 * h),
        (r * 0.885, 0.086 * h, True),
        (r * 0.91, 0.098 * h),
        (r * 0.905, 0.113 * h),
        (r * 0.85, 0.126 * h, True),
    ]


def collar(z, wide, narrow, neck):
    """A double collar: a wide disc with a smaller disc above it, then the neck."""
    return [
        (neck * 1.15, z - 0.03),
        (wide * 0.93, z - 0.006, True),
        (wide, z + 0.012),
        (wide * 0.97, z + 0.03),
        (narrow * 0.86, z + 0.042, True),
        (narrow, z + 0.056),
        (narrow * 0.97, z + 0.074),
        (neck, z + 0.09, True),
    ]


def king():
    r = BASE_RADIUS["king"]
    return (
        base(r)
        + [
            (r * 0.82, 0.16),
            (0.272, 0.22),
            (0.225, 0.30),
            (0.183, 0.40),
            (0.152, 0.52),
            (0.130, 0.66),
            (0.117, 0.82),
            (0.115, 0.93),
        ]
        + collar(1.0, 0.225, 0.172, 0.125)
        + [
            (0.142, 1.15),
            (0.185, 1.26),
            (0.214, 1.36),
            (0.224, 1.43, True),
            (0.207, 1.47),
            (0.160, 1.505),
            (0.080, 1.525),
            (0.0, 1.53, True),
        ]
    )


def queen():
    r = BASE_RADIUS["queen"]
    return (
        base(r)
        + [
            (r * 0.82, 0.16),
            (0.262, 0.22),
            (0.214, 0.30),
            (0.172, 0.40),
            (0.143, 0.51),
            (0.121, 0.64),
            (0.108, 0.78),
            (0.106, 0.90),
        ]
        + collar(0.97, 0.212, 0.165, 0.118)
        + [
            (0.128, 1.12),
            (0.166, 1.23),
            (0.204, 1.34),
            (0.236, 1.44),
            (0.242, 1.475, True),
            (0.215, 1.49, True),
            (0.175, 1.455),
            (0.12, 1.47),
            (0.065, 1.515),
            (0.036, 1.535, True),
            (0.036, 1.548, True),
            # The ball finial.
            (0.046, 1.556),
            (0.056, 1.578),
            (0.052, 1.605),
            (0.034, 1.623),
            (0.0, 1.63, True),
        ]
    )


def bishop():
    r = BASE_RADIUS["bishop"]
    return (
        base(r)
        + [
            (r * 0.82, 0.155),
            (0.228, 0.20),
            (0.190, 0.27),
            (0.155, 0.36),
            (0.128, 0.46),
            (0.110, 0.56),
            (0.102, 0.63),
        ]
        + collar(0.70, 0.17, 0.13, 0.098)
        + [
            # The miter, egg-shaped.
            (0.118, 0.81),
            (0.153, 0.86),
            (0.172, 0.93),
            (0.168, 1.01),
            (0.145, 1.09),
            (0.104, 1.16),
            (0.058, 1.21),
            (0.030, 1.235, True),
            (0.028, 1.255, True),
            # Small ball on top.
            (0.042, 1.265),
            (0.054, 1.29),
            (0.052, 1.32),
            (0.034, 1.35),
            (0.0, 1.36, True),
        ]
    )


def rook():
    r = BASE_RADIUS["rook"]
    return (
        base(r)
        + [
            (r * 0.83, 0.155),
            (0.245, 0.195),
            (0.224, 0.26),
            (0.210, 0.36),
            (0.203, 0.48),
            (0.202, 0.58),
            (0.207, 0.64),
            (0.214, 0.665, True),
            (0.236, 0.678),
            (0.242, 0.695),
            (0.235, 0.712),
            (0.212, 0.722, True),
            (0.222, 0.75),
            (0.250, 0.81),
            (0.272, 0.87),
            (0.282, 0.905, True),
            (0.278, 0.93, True),
            (0.225, 0.93, True),
            (0.215, 0.875, True),
            (0.0, 0.875, True),
        ]
    )


def pawn():
    """Drawn at 0.87 squares and scaled to the measured 0.83."""
    r = BASE_RADIUS["pawn"]
    k = HEIGHTS["pawn"] / 0.87
    return [(p[0], p[1] * k, *p[2:]) for p in _pawn_points(r)]


def _pawn_points(r):
    return (
        base(r, 0.85)
        + [
            (r * 0.83, 0.135),
            (0.185, 0.17),
            (0.158, 0.22),
            (0.130, 0.29),
            (0.108, 0.36),
            (0.095, 0.42),
            (0.093, 0.455),
        ]
        + [
            (0.118, 0.47, True),
            (0.152, 0.488),
            (0.158, 0.505),
            (0.148, 0.522),
            (0.105, 0.535, True),
            (0.092, 0.556),
            # Ball head: centre 0.72, radius 0.15.
            (0.104, 0.590),
            (0.137, 0.630),
            (0.150, 0.690),
            (0.148, 0.740),
            (0.134, 0.792),
            (0.106, 0.832),
            (0.062, 0.861),
            (0.0, 0.87, True),
        ]
    )


def knight_foot():
    """The knight's turned foot; the carved head stands on its top face."""
    r = BASE_RADIUS["knight"]
    return base(r) + [
        (r * 0.83, 0.155),
        (0.238, 0.20),
        (0.226, 0.25),
        (0.222, 0.29, True),
        (0.0, 0.30, True),
    ]


PROFILES = {
    "king": king,
    "queen": queen,
    "bishop": bishop,
    "rook": rook,
    "pawn": pawn,
    "knight_foot": knight_foot,
}
