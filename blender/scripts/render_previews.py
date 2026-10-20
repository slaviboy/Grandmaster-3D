# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Renders preview images of chess_set.blend into blender/renders/.

lineup.jpg shows all twelve pieces from slightly above; gameplay.jpg shows them from roughly the
game's camera angle; {type}.jpg is a close-up of each white piece. EEVEE with the Standard view transform, so
colours compare directly with the game.

Run: Blender -b blender/chess_set.blend --python-exit-code 1 -P blender/scripts/render_previews.py
"""

import math
import os

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

import common

TYPES = ["pawn", "rook", "knight", "bishop", "queen", "king"]


def setup(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.eevee.taa_render_samples = 32
    world = bpy.data.worlds.get("preview") or bpy.data.worlds.new("preview")
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.03, 0.07, 0.10, 1.0)
    background.inputs["Strength"].default_value = 1.0

    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 3.2
    key.data.angle = math.radians(6)
    key.rotation_euler = (math.radians(45), math.radians(10), math.radians(35))
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 0.8
    fill.rotation_euler = (math.radians(60), 0, math.radians(-140))
    floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor"))
    floor.data.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    floor_mat = bpy.data.materials.new("floor")
    floor_mat.diffuse_color = (0.85, 0.55, 0.3, 1)
    if floor_mat.node_tree is None:
        floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.75, 0.45, 0.22, 1)
    floor.data.materials.append(floor_mat)
    for o in (key, fill, floor):
        scene.collection.objects.link(o)
    camera = bpy.data.objects.new("preview-camera", bpy.data.cameras.new("preview-camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render(scene, path, width, height):
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main():
    scene = bpy.context.scene
    camera = setup(scene)
    out = os.path.join(common.ROOT, "blender", "renders")
    os.makedirs(out, exist_ok=True)

    # Lay the pieces out in two rows, white in front.
    for side, y in (("white", -0.6), ("black", 0.6)):
        for i, kind in enumerate(TYPES):
            obj = bpy.data.objects[f"{side}-{kind}"]
            obj.location = ((i - 2.5) * 0.95, y, 0)
            obj.rotation_euler = (0, 0, 0)

    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 6.6
    camera.location = (0, -12 * math.cos(math.radians(18)), 0.8 + 12 * math.sin(math.radians(18)))
    camera.rotation_euler = (math.radians(72), 0, 0)
    render(scene, os.path.join(out, "lineup.jpg"), 1600, 900)

    camera.data.type = "PERSP"
    camera.data.lens = 60
    elevation = math.radians(48)
    camera.location = (0, -13 * math.cos(elevation), 13 * math.sin(elevation))
    camera.rotation_euler = (math.pi / 2 - elevation, 0, 0)
    render(scene, os.path.join(out, "gameplay.jpg"), 1600, 900)

    # Close-ups, one white piece at a time.
    for kind in TYPES:
        for o in scene.objects:
            if o.name.startswith(("white-", "black-")):
                o.hide_render = o.name != f"white-{kind}"
        obj = bpy.data.objects[f"white-{kind}"]
        obj.location = (0, 0, 0)
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = 2.0
        camera.location = (0, -10, 0.92)
        camera.rotation_euler = (math.radians(88), 0, math.radians(0))
        obj.rotation_euler = (0, 0, math.radians(-30))
        render(scene, os.path.join(out, f"{kind}.jpg"), 512, 768)


main()
