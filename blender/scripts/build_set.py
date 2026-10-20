# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Builds the whole chess set into blender/chess_set.blend.

One master mesh per piece type lives in the "Masters" collection; the "White" and "Black"
collections hold one object per type that shares that mesh and carries its side's wood. Writes
blender/metadata.json with each piece's height, base radius and triangle count, and fails if a
piece is not watertight or breaks its triangle budget.

Run: Blender -b --factory-startup --python-exit-code 1 -P blender/scripts/build_set.py
"""

import json
import os
import time

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

import common
import knight
import materials
import pieces
from profiles import BASE_RADIUS, HEIGHTS, RADIAL_SCALE

TYPES = ["pawn", "rook", "knight", "bishop", "queen", "king"]
BUDGET = {"pawn": 6000, "rook": 9000, "knight": 15000, "bishop": 11000, "queen": 15000, "king": 12000}
BUILDERS = {**pieces.BUILDERS, **knight.BUILDERS}


def main():
    common.reset_scene()
    masters = common.ensure_collection("Masters")
    sides = {c: common.ensure_collection(c.capitalize()) for c in ("white", "black")}
    woods = {c: materials.wood_material(c) for c in sides}
    for c in sides:
        materials.export_material(c)

    metadata = {}
    for index, kind in enumerate(TYPES):
        started = time.time()
        master = BUILDERS[kind]()
        common.ground(master)
        master.name = kind
        master.data.name = kind
        common.move_to_collection(master, masters)
        master.hide_render = True

        b = common.bounds(master)
        height = b["max"][2]
        radius = max(-b["min"][0], b["max"][0], -b["min"][1], b["max"][1])
        tris = common.triangle_count(master)
        if not common.is_manifold(master):
            raise RuntimeError(f"{kind} is not watertight")
        if tris > BUDGET[kind]:
            raise RuntimeError(f"{kind} has {tris} triangles, over its budget of {BUDGET[kind]}")
        if abs(height - HEIGHTS[kind]) > 0.02:
            raise RuntimeError(f"{kind} is {height:.3f} tall, expected {HEIGHTS[kind]}")
        metadata[kind] = {
            "height": round(height, 4),
            "baseRadius": round(BASE_RADIUS[kind] * RADIAL_SCALE[kind], 4),
            "maxRadius": round(radius, 4),
            "triangles": tris,
        }

        for c, collection in sides.items():
            obj = bpy.data.objects.new(f"{c}-{kind}", master.data)
            collection.objects.link(obj)
            # Object-level material links let both sides share one mesh.
            if not obj.data.materials:
                obj.data.materials.append(None)
            obj.material_slots[0].link = "OBJECT"
            obj.material_slots[0].material = woods[c]
            obj.location = ((index - 2.5) * 0.9, 0.0 if c == "white" else 1.2, 0.0)
        print(f"{kind}: {tris} triangles, {height:.3f} tall, {time.time() - started:.1f}s")

    blend = os.path.join(common.ROOT, "blender", "chess_set.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    with open(os.path.join(common.ROOT, "blender", "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
        f.write("\n")
    print("saved", blend)


main()
