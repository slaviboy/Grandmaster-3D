# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""The Maximum Strength opponent's portrait: a brass and steel automaton bust.

The other opponents are old-master portraits, so the automaton is lit the same way: one warm key
light high on the left, a faint fill, a cool rim from behind and a dark umber background, seen in a
three-quarter view. Run headless:

    blender --background --python blender/scripts/robot_portrait.py -- out.png
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

WIDTH, HEIGHT = 768, 960


def material(name, colour, metallic=1.0, roughness=0.35, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def add(obj, mat, smooth=True):
    obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def sphere(name, location, scale, mat, segments=64):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return add(obj, mat)


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    return add(obj, mat)


def torus(name, location, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=location, rotation=rotation,
        major_segments=64, minor_segments=16,
    )
    obj = bpy.context.active_object
    obj.name = name
    return add(obj, mat)


def box(name, location, size, mat, bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    return add(obj, mat)


def build_bust():
    brass = material("brass", (0.62, 0.43, 0.2), roughness=0.42)
    dark_brass = material("dark brass", (0.33, 0.22, 0.1), roughness=0.45)
    # Rough enough to catch the key light rather than mirror the dark room.
    steel = material("steel", (0.62, 0.63, 0.65), roughness=0.5)
    shadow = material("socket", (0.02, 0.02, 0.025), metallic=0.0, roughness=0.6)
    glow = material("eye", (0.2, 0.7, 0.9), metallic=0.0, roughness=0.2,
                    emission=(0.2, 0.75, 1.0), strength=1.6)

    # Head: a rounded brass dome with a steel face plate.
    sphere("head", (0, 0, 1.62), (0.42, 0.44, 0.5), brass)
    sphere("face", (0, -0.12, 1.56), (0.34, 0.34, 0.4), steel)
    # Brow ridge and a crest running over the dome.
    torus("brow", (0, -0.2, 1.7), 0.3, 0.03, dark_brass, rotation=(math.radians(80), 0, 0))
    box("crest", (0, 0.02, 2.08), (0.07, 0.62, 0.08), dark_brass, bevel=0.02)

    # Eyes: glowing lenses in dark sockets with brass rims.
    for x in (-0.13, 0.13):
        cylinder("socket", (x, -0.42, 1.63), 0.085, 0.06, shadow, rotation=(math.radians(90), 0, 0))
        torus("rim", (x, -0.45, 1.63), 0.085, 0.016, brass, rotation=(math.radians(90), 0, 0))
        sphere("lens", (x, -0.43, 1.63), (0.055, 0.03, 0.055), glow, segments=32)

    # Mouth grille.
    for i in range(5):
        box("grille", (0, -0.43 + abs(i - 2) * 0.012, 1.4 - i * 0.035), (0.2 - abs(i - 2) * 0.03, 0.03, 0.016),
            dark_brass, bevel=0.005)

    # Ear discs with bolts.
    for side in (-1, 1):
        cylinder("ear", (side * 0.42, 0, 1.6), 0.13, 0.08, dark_brass, rotation=(0, math.radians(90), 0))
        cylinder("ear cap", (side * 0.47, 0, 1.6), 0.07, 0.04, steel, rotation=(0, math.radians(90), 0))

    # Neck: a steel column with brass rings.
    cylinder("neck", (0, 0, 1.08), 0.14, 0.32, steel)
    for z in (0.98, 1.08, 1.18):
        torus("neck ring", (0, 0, z), 0.145, 0.018, brass)

    # Shoulders and chest: a broad brass cuirass with a collar and rivets.
    chest = sphere("chest", (0, 0.05, 0.42), (0.95, 0.55, 0.62), brass)
    torus("collar", (0, 0, 0.93), 0.24, 0.05, dark_brass)
    plate = sphere("chest plate", (0, -0.4, 0.5), (0.42, 0.07, 0.3), steel)
    for i in range(7):
        a = math.radians(-60 + i * 20)
        sphere("rivet", (math.sin(a) * 0.5, -0.3 - math.cos(a) * 0.12, 0.88 - abs(math.sin(a)) * 0.12),
               (0.022, 0.022, 0.022), dark_brass, segments=16)
    for side in (-1, 1):
        sphere("pauldron", (side * 0.82, 0.05, 0.72), (0.32, 0.36, 0.26), dark_brass)
    return chest, plate


def light(name, kind, location, energy, colour, size=1.0, target=(0, 0, 1.5)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def main():
    out = common.script_args()[0]
    common.reset_scene()
    scene = bpy.context.scene
    build_bust()

    # Dark umber backdrop, lighter behind the head, as in the old-master portraits.
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.022, 0.014, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    backdrop = material("backdrop", (0.03, 0.025, 0.017), metallic=0.0, roughness=1.0)
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0.6, 3.5, 1.4), rotation=(math.radians(90), 0, 0))
    bpy.context.active_object.data.materials.append(backdrop)

    key = light("key", "SPOT", (-2.4, -2.6, 3.2), 2000, (1.0, 0.84, 0.64), target=(0, 0, 1.3))
    key.data.spot_size = math.radians(38)
    key.data.spot_blend = 0.8
    key.data.shadow_soft_size = 0.6
    light("fill", "AREA", (2.6, -2.4, 1.4), 70, (0.9, 0.92, 1.0), size=2.5)
    light("rim", "SPOT", (1.4, 1.2, 2.4), 260, (0.7, 0.85, 1.0), target=(0, 0, 1.55))
    # A soft glow on the backdrop behind the head, like the lighter ground behind a sitter.
    light("backdrop glow", "POINT", (-0.4, 3.0, 1.9), 30, (1.0, 0.78, 0.5))

    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = 85
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (1.3, -5.2, 1.8)
    target = Vector((0.05, 0, 1.36))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)


main()
