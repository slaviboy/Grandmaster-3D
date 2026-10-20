# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Pre-fractures each piece type into wooden chunks for the "Demolish captures" animation.

A solid Voronoi fracture without add-ons: seeds are scattered inside the piece; each seed's cell
is built as a convex polyhedron (a large cube cut by the bisecting planes towards every other seed)
and intersected with the piece by the exact boolean solver. Cut faces get a second material slot
(raw end grain). Each chunk keeps its origin at its
own centre so it tumbles naturally. Both colours share these shapes.

Writes public/models/chess/fragments/{type}.glb.

Run: Blender -b blender/chess_set.blend --python-exit-code 1 -P blender/scripts/fracture.py
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import common

TYPES = ["pawn", "rook", "knight", "bishop", "queen", "king"]
SEEDS = {"pawn": 12, "rook": 14, "knight": 16, "bishop": 16, "queen": 18, "king": 18}


def inside(tree, point):
    """Parity test: count crossings of a ray straight up through the mesh."""
    count = 0
    origin = point.copy()
    direction = Vector((0.0013, 0.0007, 1.0)).normalized()
    for _ in range(64):
        hit = tree.ray_cast(origin, direction)
        if hit[0] is None:
            break
        count += 1
        origin = hit[0] + direction * 1e-4
    return count % 2 == 1


def scatter_seeds(obj, count, rng):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    b = common.bounds(obj)
    lo, hi = Vector(b["min"]), Vector(b["max"])
    seeds = []
    attempts = 0
    while len(seeds) < count and attempts < 20000:
        attempts += 1
        # Spread seeds over the height so tall pieces break all the way up.
        p = Vector(
            (
                rng.uniform(lo.x, hi.x),
                rng.uniform(lo.y, hi.y),
                lo.z + (hi.z - lo.z) * ((len(seeds) + rng.random()) / count),
            )
        )
        if inside(tree, p) and all((p - s).length > 0.05 for s in seeds):
            seeds.append(p)
    return seeds


def convex_cell(seeds, index, inner):
    """The Voronoi cell of seeds[index], as a closed convex mesh carrying the end-grain material."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=4.0)
    bmesh.ops.translate(bm, vec=(0, 0, 1.0), verts=bm.verts)
    me = seeds[index]
    for j, other in enumerate(seeds):
        if j == index:
            continue
        normal = (other - me).normalized()
        result = bmesh.ops.bisect_plane(
            bm,
            geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
            plane_co=(me + other) / 2,
            plane_no=normal,
            clear_outer=True,
            dist=1e-7,
        )
        boundary = [e for e in result["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
        if boundary:
            bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    mesh = bpy.data.meshes.new("cell")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(inner)
    obj = bpy.data.objects.new("cell", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def cell(obj, seeds, index, outer, inner):
    """The part of the piece closer to seeds[index] than to any other seed, as a bmesh."""
    piece = bpy.data.objects.new("piece-copy", obj.data.copy())
    bpy.context.scene.collection.objects.link(piece)
    piece.data.materials.clear()
    piece.data.materials.append(outer)
    for poly in piece.data.polygons:
        poly.material_index = 0
    cutter = convex_cell(seeds, index, inner)
    mod = piece.modifiers.new("cell", "BOOLEAN")
    mod.operation = "INTERSECT"
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"
    mod.object = cutter
    common.apply_modifiers(piece)
    common.remove(cutter)
    # Slot 0 is the outer wood, slot 1 the end grain of the cuts.
    slots = [m.name if m else None for m in piece.data.materials]
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    for face in bm.faces:
        name = slots[face.material_index] if face.material_index < len(slots) else None
        face.material_index = 1 if name == inner.name else 0
    common.remove(piece)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    # The solver occasionally leaves a sliver-sized gap where a cut meets a flat face; close it.
    gaps = [e for e in bm.edges if e.is_boundary]
    if gaps:
        filled = bmesh.ops.holes_fill(bm, edges=gaps, sides=0)
        for face in filled["faces"]:
            face.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def main():
    rng = random.Random(1234)
    out_dir = os.path.join(common.ROOT, "public", "models", "chess", "fragments")
    os.makedirs(out_dir, exist_ok=True)
    outer = bpy.data.materials.get("wood_white_export")
    inner = bpy.data.materials.get("end_grain") or bpy.data.materials.new("end_grain")
    if inner.node_tree is None:
        inner.use_nodes = True
    inner.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.86, 0.72, 0.52, 1)
    inner.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85

    for kind in TYPES:
        source = bpy.data.objects[kind]
        bm_full = bmesh.new()
        bm_full.from_mesh(source.data)
        piece_volume = bm_full.calc_volume()
        bm_full.free()

        # Some seed layouts cut through tricky spots (an ear, the rook's hollow crown) and leave a
        # chunk open; then the whole piece is fractured again with fresh seeds.
        for attempt in range(8):
            seeds = scatter_seeds(source, SEEDS[kind], rng)
            parts = []
            total_volume = 0.0
            complete = True
            for i in range(len(seeds)):
                bm = cell(source, seeds, i, outer, inner)
                if len(bm.faces) == 0:
                    bm.free()
                    continue
                if not all(e.is_manifold for e in bm.edges):
                    bm.free()
                    complete = False
                    break
                volume = abs(bm.calc_volume())
                total_volume += volume
                parts.append((i, bm))
            ratio = total_volume / piece_volume
            if complete and abs(ratio - 1) <= 0.03 and len(parts) >= SEEDS[kind] * 0.6:
                break
            for _, bm in parts:
                bm.free()
            print(f"{kind}: attempt {attempt + 1} left a chunk open, trying new seeds")
        else:
            raise RuntimeError(f"{kind}: could not fracture into closed chunks")

        root = bpy.data.objects.new(f"{kind}-fragments", None)
        bpy.context.scene.collection.objects.link(root)
        chunks = []
        for i, bm in parts:
            centre = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
            bmesh.ops.translate(bm, vec=-centre, verts=bm.verts)
            mesh = bpy.data.meshes.new(f"{kind}-chunk-{i}")
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(outer)
            mesh.materials.append(inner)
            chunk = bpy.data.objects.new(f"chunk-{i:02d}", mesh)
            chunk.location = centre
            chunk.parent = root
            bpy.context.scene.collection.objects.link(chunk)
            common.smooth_by_angle(chunk, 35)
            chunks.append(chunk)

        for o in bpy.context.scene.objects:
            o.select_set(False)
        root.select_set(True)
        for chunk in chunks:
            chunk.select_set(True)
        path = os.path.join(out_dir, f"{kind}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
            export_texcoords=False,
            export_draco_mesh_compression_enable=False,
            check_existing=False,
        )
        print(f"{kind}: {len(chunks)} chunks, volume {ratio:.3f}, {os.path.getsize(path)} bytes")


main()
