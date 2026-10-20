# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""The Bell set: the chunkier pieces of the marble-board reference.

Every piece stands on a wide bell-shaped base (about 0.7 squares across), rising into a thin stem
and a double collar before its head. Profiles were measured on the marble-board screenshot with a
camera fitted to it (scripts/calibrate-camera.ts method): king 1.75, queen 1.58, bishop 1.44,
knight 1.19, rook 1.05 and pawn 0.90 squares tall.
"""

import math

from mathutils import Matrix

import common
import knight
import pieces

HEIGHTS = {
    "king": 1.75,
    "queen": 1.58,
    "bishop": 1.44,
    "knight": 1.19,
    "rook": 1.05,
    "pawn": 0.90,
}

T = True


def bell(r, top, stem):
    """The bell base: a wide rounded dome from the board up to the stem at height `top`."""
    k = top / 0.57
    return [
        (0.0, 0.0, T),
        (r * 0.94, 0.0, T),
        (r * 0.99, 0.03 * k),
        (r * 1.03, 0.1 * k),
        (r, 0.2 * k),
        (r * 0.9, 0.29 * k),
        (r * 0.7, 0.38 * k),
        (r * 0.48, 0.46 * k),
        (stem * 1.18, 0.53 * k),
        (stem, top),
    ]


def double_collar(z, wide, narrow, neck):
    return [
        (wide * 0.78, z, T),
        (wide, z + 0.025),
        (wide, z + 0.06),
        (wide * 0.94, z + 0.085),
        (narrow * 0.82, z + 0.1, T),
        (narrow, z + 0.13),
        (narrow, z + 0.17),
        (narrow * 0.92, z + 0.2),
        (neck, z + 0.22, T),
    ]


def queen():
    return (
        bell(0.35, 0.6, 0.108)
        + [(0.104, 0.7), (0.108, 0.79)]
        + double_collar(0.82, 0.18, 0.168, 0.12)
        + [
            (0.115, 1.1),
            (0.13, 1.17),
            (0.17, 1.24),
            (0.225, 1.32),
            (0.25, 1.41),
            (0.252, 1.455, T),
            (0.22, 1.465, T),
            (0.16, 1.44),
            (0.10, 1.47),
            (0.05, 1.51),
            (0.032, 1.52, T),
            (0.032, 1.53, T),
            (0.045, 1.538),
            (0.052, 1.555),
            (0.045, 1.573),
            (0.0, 1.58, T),
        ]
    )


def king():
    return (
        bell(0.36, 0.58, 0.1)
        + [(0.098, 0.7), (0.102, 0.82)]
        + double_collar(0.86, 0.172, 0.16, 0.105)
        + [
            (0.1, 1.16),
            (0.11, 1.22),
            (0.15, 1.28),
            (0.185, 1.36),
            (0.19, 1.43),
            (0.18, 1.47, T),
            (0.12, 1.49),
            (0.04, 1.5),
            (0.0, 1.5, T),
        ]
    )


def bishop():
    return (
        bell(0.32, 0.52, 0.095)
        + [(0.095, 0.6), (0.098, 0.72)]
        + double_collar(0.74, 0.165, 0.14, 0.1)
        + [
            (0.12, 0.99),
            (0.152, 1.04),
            (0.165, 1.1),
            (0.152, 1.19),
            (0.11, 1.27),
            (0.06, 1.33),
            (0.03, 1.35, T),
            (0.028, 1.37, T),
            (0.042, 1.38),
            (0.052, 1.4),
            (0.046, 1.425),
            (0.0, 1.44, T),
        ]
    )


def rook():
    return bell(0.34, 0.46, 0.14) + [
        (0.14, 0.52),
        (0.17, 0.56, T),
        (0.205, 0.585),
        (0.205, 0.62),
        (0.17, 0.645, T),
        (0.165, 0.72),
        (0.19, 0.84),
        (0.232, 0.94),
        (0.25, 0.995, T),
        (0.245, 1.05, T),
        (0.198, 1.05, T),
        (0.188, 0.99, T),
        (0.0, 0.99, T),
    ]


def pawn():
    return [
        (0.0, 0.0, T),
        (0.255, 0.0, T),
        (0.27, 0.025),
        (0.278, 0.08),
        (0.265, 0.16),
        (0.22, 0.24),
        (0.15, 0.32),
        (0.1, 0.38),
        (0.085, 0.43),
        (0.11, 0.46, T),
        (0.15, 0.48),
        (0.152, 0.5),
        (0.14, 0.52),
        (0.09, 0.54, T),
        (0.085, 0.57),
        (0.1, 0.6),
        (0.135, 0.63),
        (0.158, 0.7),
        (0.158, 0.76),
        (0.14, 0.82),
        (0.105, 0.86),
        (0.06, 0.89),
        (0.0, 0.9, T),
    ]


def knight_foot():
    return [
        (0.0, 0.0, T),
        (0.31, 0.0, T),
        (0.33, 0.03),
        (0.34, 0.1),
        (0.32, 0.2),
        (0.27, 0.29),
        (0.24, 0.34),
        (0.235, 0.37, T),
        (0.0, 0.38, T),
    ]


def turned(name, profile):
    return common.lathe(name, common.catmull_rom(profile, samples=3), steps=pieces.LATHE_STEPS)


def build_pawn():
    obj = turned("bell-pawn", pawn())
    common.smooth_by_angle(obj, 38)
    return obj


def build_rook():
    obj = turned("bell-rook", rook())
    for angle in (0.0, math.pi / 2):
        cutter = common.box("crenel", (0.8, 0.1, 0.14), location=(0, 0, 0.975 + 0.07), rotation=(0, 0, angle))
        common.boolean(obj, cutter)
    pieces.bevel_and_weight(obj, width=0.005)
    common.smooth_by_angle(obj, 38)
    return obj


def build_bishop():
    obj = turned("bell-bishop", bishop())
    cutter = common.box("slit", (0.3, 0.6, 0.022), location=(0.15, 0, 1.13), rotation=(math.radians(40), 0, 0))
    common.boolean(obj, cutter)
    pieces.bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


def build_queen():
    obj = turned("bell-queen", queen())
    for i in range(8):
        a = (i + 0.5) * 2 * math.pi / 8
        cutter = common.sphere("scallop", 0.056, location=(math.cos(a) * 0.262, math.sin(a) * 0.262, 1.462))
        common.boolean(obj, cutter)
    pieces.bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


def build_king():
    obj = turned("bell-king", king())
    cross = pieces.cross_pattee("cross")
    # The Staunton cross stands from 1.50 to 1.745; this king's head tops out at 1.50 too.
    cross.data.transform(Matrix.Translation((0, 0, 0.005)))
    common.boolean(obj, cross, operation="UNION")
    pieces.bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


def build_knight():
    head = knight.build_head()
    knight.carve_details(head)
    decimate = head.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = 0.12
    common.apply_modifiers(head)
    # The carved head spans heights 0.27 to 1.30; stand it on the taller bell foot and bring its
    # top to 1.21, a little stockier than the Staunton knight.
    squash = (1.21 - 0.38) / (1.30 - 0.27)
    head.data.transform(
        Matrix.Translation((0, 0, 0.38 - 0.02))
        @ Matrix.Diagonal((0.9, 1.0, squash, 1.0))
        @ Matrix.Translation((0, 0, -0.27))
    )
    foot = turned("bell-knight", knight_foot())
    common.boolean(foot, head, operation="UNION")
    common.smooth_by_angle(foot, 40)
    return foot


BUILDERS = {
    "pawn": build_pawn,
    "rook": build_rook,
    "knight": build_knight,
    "bishop": build_bishop,
    "queen": build_queen,
    "king": build_king,
}
