# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""The knight: a carved horse head on a turned foot.

The head starts as a side silhouette (ears, forehead, muzzle, jaw, chest and mane) that is filled
and inflated into a pillow whose thickness varies over the head: broad at the neck, slimmer at the
muzzle, thin at the ears. A voxel remesh fuses it into one organic surface, then eye sockets,
nostrils and the mouth are cut in and the mane is grooved. The horse faces -X, which is how the
knights stand in the reference (looking toward the a-file from White's side).
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import common
import pieces
from profiles import RADIAL_SCALE

# Side silhouette in (forward, height) squares; forward = toward the muzzle. Listed going up the
# back of the mane, over the ears, down the face, under the jaw and down the chest.
SILHOUETTE = [
    (-0.205, 0.27),
    (-0.235, 0.36),
    (-0.250, 0.48),
    (-0.250, 0.60),
    (-0.235, 0.72),
    (-0.205, 0.84),
    (-0.165, 0.95),
    (-0.120, 1.05),
    (-0.085, 1.13),
    (-0.070, 1.20),
    (-0.050, 1.268),
    (-0.028, 1.300),
    (-0.008, 1.265),
    (0.012, 1.215),
    (0.040, 1.195),
    (0.085, 1.160),
    (0.140, 1.100),
    (0.200, 1.025),
    (0.255, 0.950),
    (0.300, 0.880),
    (0.335, 0.825),
    (0.352, 0.780),
    (0.350, 0.742),
    (0.330, 0.712),
    (0.292, 0.700),
    (0.255, 0.705),
    (0.215, 0.690),
    (0.160, 0.690),
    (0.105, 0.712),
    (0.060, 0.712),
    (0.030, 0.680),
    (0.030, 0.620),
    (0.060, 0.540),
    (0.105, 0.460),
    (0.150, 0.380),
    (0.185, 0.300),
    (0.190, 0.27),
]


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def half_thickness(u, z):
    """Half the head's thickness at a point of the silhouette."""
    t = 0.19 - 0.06 * smoothstep(0.55, 1.05, z)
    t *= 1.0 - 0.30 * smoothstep(0.10, 0.34, u)  # slimmer toward the muzzle
    if z > 1.16:
        t = min(t, 0.062)  # ears
    return t


def resample_closed(points, step=0.012):
    """Evenly spaced points along a closed Catmull-Rom curve through `points`."""
    n = len(points)
    dense = []
    for i in range(n):
        p0 = Vector(points[(i - 1) % n])
        p1 = Vector(points[i])
        p2 = Vector(points[(i + 1) % n])
        p3 = Vector(points[(i + 2) % n])
        count = max(2, int((p2 - p1).length / step))
        for s in range(count):
            t = s / count
            t2, t3 = t * t, t * t * t
            dense.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    return dense


def distance_to_outline(p, outline):
    best = 1e9
    n = len(outline)
    for i in range(n):
        a = outline[i]
        b = outline[(i + 1) % n]
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        best = min(best, (p - (a + ab * t)).length)
    return best


def build_head():
    outline = resample_closed(SILHOUETTE)
    mesh = bpy.data.meshes.new("knight_head")
    bm = bmesh.new()
    # Build in the X/Z plane with forward = -X, then inflate along Y.
    verts = [bm.verts.new((-p.x, 0.0, p.y)) for p in outline]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    # Scanline fill copes with the concave throat and jaw, where an n-gon triangulation leaks.
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, 1, 0))
    for _ in range(4):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
        bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=bm.edges[:])

    # Mirror the sheet to make the back half, sharing the outline.
    back = bmesh.ops.duplicate(bm, geom=bm.faces[:] + bm.edges[:] + bm.verts[:])
    back_verts = [g for g in back["geom"] if isinstance(g, bmesh.types.BMVert)]
    back_faces = [g for g in back["geom"] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(bm, faces=back_faces)
    front_verts = [v for v in bm.verts if v not in set(back_verts)]
    for side, vs in ((1.0, front_verts), (-1.0, back_verts)):
        for v in vs:
            u, z = -v.co.x, v.co.z
            d = distance_to_outline(Vector((u, z)), outline)
            # Rounded edges: thickness rises like a quarter ellipse over the first 0.1 squares.
            k = min(1.0, d / 0.1)
            v.co.y = side * half_thickness(u, z) * math.sqrt(1.0 - (1.0 - k) ** 2)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("knight_head", mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Fuse into one clean, watertight surface and soften.
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.0065
    smooth = obj.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 6
    common.apply_modifiers(obj)
    # Cut only now: the exact boolean needs the watertight remeshed surface.
    cut_features(obj)
    return obj


def cut_features(head):
    """Eye sockets, nostrils and the gap between the ears."""
    for side in (1, -1):
        t = half_thickness(0.07, 1.06)
        common.boolean(head, common.sphere("eye", 0.028, location=(-0.07, side * t * 0.97, 1.06)))
        common.boolean(
            head, common.sphere("nostril", 0.022, location=(-0.34, side * 0.06, 0.79))
        )
    common.boolean(head, common.box("ears", (0.07, 0.05, 0.12), location=(-0.03, 0, 1.31)))


def carve_details(head):
    """Grooves pressed into the surface: the mane strands and the line of the mouth."""
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.normal_update()
    for v in bm.verts:
        u, y, z = -v.co.x, v.co.y, v.co.z
        depth = 0.0
        if u < -0.10 and 0.35 < z < 1.12:
            # Mane strands, strongest at the back edge, fading near the ears and the foot.
            w = smoothstep(-0.10, -0.20, u) * smoothstep(0.35, 0.5, z) * (1 - smoothstep(1.0, 1.12, z))
            depth += 0.008 * w * (0.5 + 0.5 * math.sin(z * 70.0 + y * 25.0 + u * 30.0))
        if u > 0.24:
            # The mouth: a soft groove around the muzzle just above the chin.
            mouth_z = 0.722 + (u - 0.24) * 0.12
            depth += 0.012 * math.exp(-(((z - mouth_z) / 0.009) ** 2)) * smoothstep(0.24, 0.30, u)
        if depth:
            v.co -= v.normal * depth
    bm.to_mesh(head.data)
    bm.free()


def build_knight():
    head = build_head()
    carve_details(head)
    decimate = head.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = 0.12
    common.apply_modifiers(head)
    # Narrow the head as measured on the reference (0.5 squares muzzle to mane), keeping its height.
    head.data.transform(
        Matrix.Diagonal((0.86 * RADIAL_SCALE["knight"], RADIAL_SCALE["knight"], 1.0, 1.0))
    )
    foot = pieces.turned("knight", "knight_foot")
    common.boolean(foot, head, operation="UNION")
    common.smooth_by_angle(foot, 40)
    return foot


BUILDERS = {"knight": build_knight}
