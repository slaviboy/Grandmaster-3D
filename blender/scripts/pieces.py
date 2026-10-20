# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""The turned pieces: lathe bodies from profiles.py plus their carved details."""

import math

import bmesh
import bpy

import common
from profiles import PROFILES

LATHE_STEPS = 48


def turned(name, profile_name, steps=LATHE_STEPS, samples=3):
    profile = common.catmull_rom(PROFILES[profile_name](), samples=samples)
    return common.lathe(name, profile, steps=steps)


def bevel_and_weight(obj, width=0.006, segments=2, angle=40):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    mod.use_clamp_overlap = True
    common.apply_modifiers(obj)


def build_pawn():
    obj = turned("pawn", "pawn")
    common.smooth_by_angle(obj, 38)
    return obj


def build_rook():
    obj = turned("rook", "rook")
    # Four crenels: two slots through the crown, square to the board so one faces each side.
    for angle in (0.0, math.pi / 2):
        cutter = common.box(
            "crenel",
            (0.8, 0.11, 0.14),
            location=(0, 0, 1.075 + 0.07),
            rotation=(0, 0, angle),
        )
        common.boolean(obj, cutter)
    bevel_and_weight(obj, width=0.005)
    common.smooth_by_angle(obj, 38)
    return obj


def build_bishop():
    obj = turned("bishop", "bishop")
    # The miter's slit: a thin slab tilted 40 degrees, cut in from the piece's +x side to just past
    # the axis, so it shows as a diagonal groove to a viewer on White's right.
    cutter = common.box(
        "slit",
        (0.30, 0.6, 0.024),
        location=(0.165, 0, 1.0),
        rotation=(math.radians(40), 0, 0),
    )
    common.boolean(obj, cutter)
    bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


def build_queen():
    obj = turned("queen", "queen")
    # Eight scallops cut into the crown rim leave eight points.
    for i in range(8):
        a = (i + 0.5) * 2 * math.pi / 8
        cutter = common.sphere(
            "scallop", 0.056, location=(math.cos(a) * 0.252, math.sin(a) * 0.252, 1.482)
        )
        common.boolean(obj, cutter)
    bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


def cross_pattee(name, thickness=0.062):
    """The king's cross with flared arms, facing -Y (toward White after export)."""
    outline = [
        (0.042, 1.745),
        (-0.042, 1.745),
        (-0.024, 1.668),
        (-0.104, 1.688),
        (-0.104, 1.602),
        (-0.024, 1.622),
        (-0.034, 1.50),
        (0.034, 1.50),
        (0.024, 1.622),
        (0.104, 1.602),
        (0.104, 1.688),
        (0.024, 1.668),
    ]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, -thickness / 2, z)) for x, z in outline]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, thickness, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = 0.009
    mod.segments = 3
    mod.limit_method = "ANGLE"
    common.apply_modifiers(obj)
    return obj


def build_king():
    obj = turned("king", "king")
    common.boolean(obj, cross_pattee("cross"), operation="UNION")
    bevel_and_weight(obj, width=0.004)
    common.smooth_by_angle(obj, 38)
    return obj


BUILDERS = {
    "pawn": build_pawn,
    "rook": build_rook,
    "bishop": build_bishop,
    "queen": build_queen,
    "king": build_king,
}
