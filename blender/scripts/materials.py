# Copyright (C) 2026 Stanislav Georgiev
# https://github.com/slaviboy
#
# This file is part of Grandmaster 3D.
#
# Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
# GNU General Public License as published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version. See the LICENSE file for the full terms.

"""Wood materials for the two sides.

Turned pieces show long grain up their sides and growth rings on their tops, so the grain is a
solid texture in object space: rings around the piece's vertical axis, slightly off centre, warped
by noise. The same idea runs in the game as a shader (src/scene/woodMaterial.ts). glTF cannot carry
procedural nodes, so each material also records the flat colour, roughness and clear coat that the
exporter writes.
"""

import bpy

WOODS = {
    "white": {
        "light": (0.80, 0.62, 0.42),
        "dark": (0.58, 0.39, 0.22),
        "flat": (0.76, 0.58, 0.38, 1.0),
        "roughness": 0.42,
        "coat": 0.35,
    },
    "black": {
        "light": (0.20, 0.098, 0.045),
        "dark": (0.075, 0.033, 0.014),
        "flat": (0.16, 0.078, 0.035, 1.0),
        "roughness": 0.40,
        "coat": 0.40,
    },
}


def wood_material(color):
    spec = WOODS[color]
    name = f"wood_{color}"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = spec["roughness"]
    bsdf.inputs["Coat Weight"].default_value = spec["coat"]
    bsdf.inputs["Coat Roughness"].default_value = 0.25
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    # Off-centre axis so the rings are not concentric with the turning.
    mapping.inputs["Location"].default_value = (0.11, -0.07, 0.0)
    mapping.inputs["Rotation"].default_value = (0.05, 0.03, 0.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "Z"
    wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 9.0
    wave.inputs["Distortion"].default_value = 4.0
    wave.inputs["Detail"].default_value = 3.0
    wave.inputs["Detail Scale"].default_value = 1.2
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*spec["light"], 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*spec["dark"], 1.0)
    mid = ramp.color_ramp.elements.new(0.75)
    mid.color = (*[(a + b) / 2 for a, b in zip(spec["light"], spec["dark"])], 1.0)
    links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    mat["flat_color"] = spec["flat"]
    mat.diffuse_color = spec["flat"]
    return mat


def export_material(color):
    """A flat material the glTF exporter can write: colour, roughness and clear coat."""
    spec = WOODS[color]
    name = f"wood_{color}_export"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = spec["flat"]
    bsdf.inputs["Roughness"].default_value = spec["roughness"]
    bsdf.inputs["Coat Weight"].default_value = spec["coat"]
    bsdf.inputs["Coat Roughness"].default_value = 0.25
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    # Unused in the scene itself, so keep it in the saved file for the export step.
    mat.use_fake_user = True
    return mat
