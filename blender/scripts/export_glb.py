# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Exports the pieces of chess_set.blend: the Staunton set to public/models/chess/{side}-{type}.glb and
the Bell set to public/models/chess/bell/{side}-{type}.glb.

Each file holds one mesh with +Y up, its base on y = 0, and a flat material (colour, roughness and
clear coat). Both sides of a type share identical geometry, so the game loads each shape once and
colours it with its own wood shader.

Run: Blender -b blender/chess_set.blend --python-exit-code 1 -P blender/scripts/export_glb.py
"""

import os

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

import common

TYPES = ["pawn", "rook", "knight", "bishop", "queen", "king"]


# Piece sets: object-name prefix in the .blend and output folder under public/models/chess.
SETS = [("", ""), ("bell-", "bell")]


def main():
    for prefix, folder in SETS:
        export_set(prefix, os.path.join(common.ROOT, "public", "models", "chess", folder))


def export_set(prefix, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for side in ("white", "black"):
        export_mat = bpy.data.materials[f"wood_{side}_export"]
        for kind in TYPES:
            source = bpy.data.objects[f"{prefix}{side}-{kind}"]
            # A temporary object at the origin with the flat material the exporter understands.
            obj = bpy.data.objects.new(f"{side}-{kind}", source.data.copy())
            obj.name = f"{side}-{kind}"
            obj.data.name = kind
            obj.data.materials.clear()
            obj.data.materials.append(export_mat)
            bpy.context.scene.collection.objects.link(obj)
            common.select_only(obj)
            path = os.path.join(out_dir, f"{side}-{kind}.glb")
            bpy.ops.export_scene.gltf(
                filepath=path,
                export_format="GLB",
                use_selection=True,
                export_apply=True,
                export_yup=True,
                export_materials="EXPORT",
                export_normals=True,
                export_texcoords=False,
                export_tangents=False,
                export_vertex_color="NONE",
                export_draco_mesh_compression_enable=False,
                export_cameras=False,
                export_lights=False,
                export_extras=False,
                check_existing=False,
            )
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)
            print("exported", path, os.path.getsize(path), "bytes")


main()
