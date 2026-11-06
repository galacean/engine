"""Render and quantify material-free procedural tree geometry parity in Blender.

The validator imports a reference mesh and receives the procedural generator's
LOD0 vertices and indices through stdin. It creates an in-memory Blender mesh,
so validation never serializes the procedural tree through an asset container.
"""

from __future__ import annotations

import json
import importlib.util
import math
import sys
import argparse
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIRECTORY = SCRIPT_DIRECTORY.parent / "generated" / "procedural-trees" / "measured-white-birch"
CAMERA_VIEWS = {
    "front": (0.0, -1.0, 0.0),
    "side": (1.0, 0.0, 0.0),
    "diagonal": (math.sqrt(0.5), -math.sqrt(0.5), 0.0),
}
SEARCH_RESOLUTION = 160
FINAL_RESOLUTION = 512
# One final-resolution pixel spans roughly three centimetres for this measured tree.
# Three pixels remain below the thinnest retained LOD0 branch collar while absorbing
# raster quantization and polygonal chord error between the reference and <=4k LOD.
MASK_TOLERANCE_PIXELS = 3


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a reference tree against streamed procedural mesh data")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIRECTORY)
    script_arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(script_arguments)


ARGUMENTS = parse_arguments()
OUTPUT_DIRECTORY = ARGUMENTS.output.resolve()
SOURCE_FBX = ARGUMENTS.input.resolve()
EXTRACTOR_MODULE_PATH = SCRIPT_DIRECTORY / "extract-procedural-tree-geometry-blueprint.py"
EXTRACTOR_SPEC = importlib.util.spec_from_file_location("procedural_tree_geometry_extractor", EXTRACTOR_MODULE_PATH)
if EXTRACTOR_SPEC is None or EXTRACTOR_SPEC.loader is None:
    raise RuntimeError("Could not load the shared procedural tree hierarchy extractor")
EXTRACTOR_MODULE = importlib.util.module_from_spec(EXTRACTOR_SPEC)
EXTRACTOR_SPEC.loader.exec_module(EXTRACTOR_MODULE)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for data_collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(data_collection):
            data_collection.remove(block)


def imported_objects() -> set[bpy.types.Object]:
    return set(bpy.context.scene.objects)


def import_source() -> bpy.types.Object:
    before = imported_objects()
    bpy.ops.import_scene.fbx(filepath=str(SOURCE_FBX), use_image_search=False)
    created = imported_objects() - before
    meshes = [obj for obj in created if obj.type == "MESH"]
    lod0 = next((obj for obj in meshes if obj.name.lower() == "lod0"), None)
    if lod0 is None:
        lod0 = next((obj for obj in meshes if "lod0" in obj.name.lower()), None)
    if lod0 is None:
        lod0 = max(meshes, key=lambda obj: len(obj.data.polygons), default=None)
    if lod0 is None:
        raise RuntimeError("Input tree mesh did not contain LOD0 geometry")
    for obj in created:
        if obj is not lod0:
            bpy.data.objects.remove(obj, do_unlink=True)
    return lod0


def import_reconstruction() -> bpy.types.Object:
    raw = sys.stdin.buffer.read()
    if not raw:
        raise RuntimeError("Procedural tree validation requires streamed runtime geometry")
    payload = json.loads(raw.decode("utf-8"))
    if payload.get("schema") != "galacean/procedural-tree-runtime-geometry-stream-v1":
        raise RuntimeError("Unsupported procedural tree runtime geometry stream")

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    roles: list[int] = []
    for role_index, name in enumerate(("trunk", "crown")):
        primitive = payload.get(name)
        positions = primitive.get("positions") if isinstance(primitive, dict) else None
        indices = primitive.get("indices") if isinstance(primitive, dict) else None
        if not isinstance(positions, list) or not isinstance(indices, list) or len(indices) % 3 != 0:
            raise RuntimeError(f"Procedural tree {name} geometry is invalid")
        vertex_offset = len(vertices)
        for point in positions:
            if not isinstance(point, list) or len(point) != 3:
                raise RuntimeError(f"Procedural tree {name} contains an invalid position")
            # Galacean coordinates are right-handed Y-up; Blender is Z-up.
            vertices.append((float(point[0]), -float(point[2]), float(point[1])))
        for index in range(0, len(indices), 3):
            triangle = tuple(vertex_offset + int(indices[index + corner]) for corner in range(3))
            if any(vertex < vertex_offset or vertex >= len(vertices) for vertex in triangle):
                raise RuntimeError(f"Procedural tree {name} contains an out-of-range index")
            faces.append(triangle)
            roles.append(role_index)

    mesh = bpy.data.meshes.new("Procedural runtime tree geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(bpy.data.materials.new("Procedural bark"))
    mesh.materials.append(bpy.data.materials.new("Procedural leaves"))
    for polygon, role in zip(mesh.polygons, roles, strict=True):
        polygon.material_index = role
    mesh.update()
    result = bpy.data.objects.new("Procedural runtime tree", mesh)
    bpy.context.scene.collection.objects.link(result)
    return result


def material_role_indices(obj: bpy.types.Object) -> tuple[int, int | None]:
    material_topology = []
    for index, slot in enumerate(obj.material_slots):
        polygons = [polygon for polygon in obj.data.polygons if polygon.material_index == index]
        if not polygons:
            continue
        vertices = {vertex for polygon in polygons for vertex in polygon.vertices}
        adjacency = {vertex: set() for vertex in vertices}
        for polygon in polygons:
            indices = list(polygon.vertices)
            for corner, left in enumerate(indices):
                right = indices[(corner + 1) % len(indices)]
                adjacency[left].add(right)
                adjacency[right].add(left)
        component_sizes = []
        unvisited = set(vertices)
        while unvisited:
            stack = [unvisited.pop()]
            size = 0
            while stack:
                vertex = stack.pop()
                size += 1
                neighbors = adjacency[vertex] & unvisited
                unvisited.difference_update(neighbors)
                stack.extend(neighbors)
            component_sizes.append(size)
        name = slot.material.name.lower() if slot.material else ""
        is_cards = bool(component_sizes and all(size == 4 for size in component_sizes)) or \
            triangulated_leaf_card_face_pairs(obj, polygons) is not None
        material_topology.append((index, name, component_sizes, len(polygons), is_cards))
    named_foliage = [
        entry
        for entry in material_topology
        if entry[4] and any(token in entry[1] for token in ("leaf", "leaves", "needle", "frond", "branch"))
    ]
    card_candidates = named_foliage or [entry for entry in material_topology if entry[4]]
    woody_candidates = [
        entry
        for entry in material_topology
        if any(token in entry[1] for token in ("bark", "trunk", "wood"))
    ]
    if not woody_candidates:
        woody_candidates = [entry for entry in material_topology if entry not in card_candidates]
    if not woody_candidates:
        woody_candidates = [
            entry for entry in material_topology if any(token in entry[1] for token in ("bark", "trunk", "wood"))
        ]
    if not woody_candidates:
        raise RuntimeError(f"{obj.name} woody material role is ambiguous: {[entry[1] for entry in material_topology]}")
    branch = max(woody_candidates, key=lambda entry: (sum(entry[2]), entry[3]))[0]
    foliage_candidates = [entry for entry in card_candidates if entry[0] != branch]
    leaf = max(foliage_candidates, key=lambda entry: (len(entry[2]), entry[3]))[0] if foliage_candidates else None
    return branch, leaf


def triangulated_leaf_card_face_pairs(
    obj: bpy.types.Object, polygons: list[bpy.types.MeshPolygon]
) -> list[tuple[bpy.types.MeshPolygon, bpy.types.MeshPolygon]] | None:
    if not polygons or any(len(polygon.vertices) != 3 for polygon in polygons) or obj.data.uv_layers.active is None:
        return None
    uv_data = obj.data.uv_layers.active.data
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    edge_uvs: dict[tuple[int, int], tuple[Vector, Vector]] = {}
    for polygon_index, polygon in enumerate(polygons):
        vertices = list(polygon.vertices)
        loops = list(polygon.loop_indices)
        for edge_index, (left, right) in enumerate(zip(vertices, vertices[1:] + vertices[:1])):
            edge = tuple(sorted((left, right)))
            edge_faces[edge].append(polygon_index)
            edge_uvs.setdefault(edge, (uv_data[loops[edge_index]].uv.copy(), uv_data[loops[(edge_index + 1) % 3]].uv.copy()))
    candidates = []
    for edge, indices in edge_faces.items():
        if len(indices) != 2:
            continue
        left_uv, right_uv = edge_uvs[edge]
        delta_u = abs(float(left_uv.x - right_uv.x))
        delta_v = abs(float(left_uv.y - right_uv.y))
        vertices = set(polygons[indices[0]].vertices) | set(polygons[indices[1]].vertices)
        if len(vertices) == 4 and delta_u > 1e-5 and delta_v > 1e-5:
            candidates.append((delta_u * delta_v, indices[0], indices[1]))
    candidates.sort(reverse=True)
    used: set[int] = set()
    pairs = []
    for _, left, right in candidates:
        if left in used or right in used:
            continue
        used.update((left, right))
        pairs.append((polygons[left], polygons[right]))
    return pairs if len(used) == len(polygons) else None


def extract_material_part(
    source: bpy.types.Object, material_index: int, name: str, display_color: tuple[float, float, float, float]
) -> bpy.types.Object:
    selected_polygons = [polygon for polygon in source.data.polygons if polygon.material_index == material_index]
    referenced_vertices = sorted({vertex for polygon in selected_polygons for vertex in polygon.vertices})
    remap = {source_index: target_index for target_index, source_index in enumerate(referenced_vertices)}
    vertices = [source.data.vertices[index].co.copy() for index in referenced_vertices]
    faces = [[remap[index] for index in polygon.vertices] for polygon in selected_polygons]
    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = source.matrix_world.copy()
    result.color = display_color
    return result


def extract_leaf_card_part(
    source: bpy.types.Object, material_index: int, name: str, display_color: tuple[float, float, float, float]
) -> bpy.types.Object:
    polygons = [polygon for polygon in source.data.polygons if polygon.material_index == material_index]
    pairs = triangulated_leaf_card_face_pairs(source, polygons)
    if pairs is None:
        return extract_material_part(source, material_index, name, display_color)
    vertices = []
    faces = []
    for pair in pairs:
        source_vertices = sorted({vertex for polygon in pair for vertex in polygon.vertices})
        remap = {source_index: len(vertices) + index for index, source_index in enumerate(source_vertices)}
        vertices.extend(source.data.vertices[index].co.copy() for index in source_vertices)
        faces.extend([[remap[index] for index in polygon.vertices] for polygon in pair])
    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = source.matrix_world.copy()
    result.color = display_color
    return result


def split_model(source: bpy.types.Object, name: str) -> dict[str, bpy.types.Object]:
    branch_index, leaf_index = material_role_indices(source)
    root = bpy.data.objects.new(f"{name} root", None)
    bpy.context.scene.collection.objects.link(root)
    branch = extract_material_part(source, branch_index, f"{name} branches", (0.28, 0.28, 0.28, 1.0))
    branch_levels = extract_branch_level_parts(branch, name)
    trunk = branch_levels["trunk"]
    primary_branches = branch_levels["primaryBranches"]
    secondary_branches = branch_levels["secondaryBranches"]
    leaves = extract_leaf_card_part(source, leaf_index, f"{name} leaf cards", (0.62, 0.62, 0.62, 1.0)) if leaf_index is not None else empty_part(f"{name} leaf cards")
    branch.parent = root
    trunk.parent = root
    primary_branches.parent = root
    secondary_branches.parent = root
    leaves.parent = root
    bpy.data.objects.remove(source, do_unlink=True)
    result = {
        "root": root,
        "trunk": trunk,
        "primaryBranches": primary_branches,
        "secondaryBranches": secondary_branches,
        "branches": branch,
        "leaves": leaves,
    }
    align_model_to_ground_and_trunk(result)
    return result


def extract_branch_level_parts(branches: bpy.types.Object, name: str) -> dict[str, bpy.types.Object]:
    paths = EXTRACTOR_MODULE.extract_unoriented_branch_paths(branches, list(branches.data.polygons))
    EXTRACTOR_MODULE.infer_branch_hierarchy(paths)
    return {
        "trunk": extract_component_part(
            branches, [path["vertices"] for path in paths if path["level"] == 0], f"{name} trunk"
        ),
        "primaryBranches": extract_component_part(
            branches,
            [path["vertices"] for path in paths if path["level"] == 1],
            f"{name} primary branches",
        ),
        "secondaryBranches": extract_component_part(
            branches,
            [path["vertices"] for path in paths if path["level"] == 2],
            f"{name} secondary branches",
        ),
    }


def extract_component_part(
    branches: bpy.types.Object, components: list[list[int]], name: str
) -> bpy.types.Object:
    if not components:
        return empty_part(name)
    selected = {vertex for component in components for vertex in component}
    local_vertices = [vertex.co.copy() for vertex in branches.data.vertices]
    polygons = [polygon for polygon in branches.data.polygons if all(index in selected for index in polygon.vertices)]
    referenced_vertices = sorted({index for polygon in polygons for index in polygon.vertices})
    remap = {source_index: target_index for target_index, source_index in enumerate(referenced_vertices)}
    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(
        [local_vertices[index] for index in referenced_vertices],
        [],
        [[remap[index] for index in polygon.vertices] for polygon in polygons],
    )
    mesh.update()
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = branches.matrix_world.copy()
    result.color = (0.28, 0.28, 0.28, 1.0)
    return result


def extract_trunk_part(branches: bpy.types.Object, name: str) -> bpy.types.Object:
    components = connected_components(branches)
    local_vertices = [vertex.co.copy() for vertex in branches.data.vertices]
    vertices = [branches.matrix_world @ vertex for vertex in local_vertices]
    minimum_z = min(vertex.z for vertex in vertices)
    maximum_z = max(vertex.z for vertex in vertices)
    base_limit = minimum_z + (maximum_z - minimum_z) * 0.025
    grounded = [component for component in components if min(vertices[index].z for index in component) <= base_limit]
    candidates = grounded or components
    trunk_component = max(
        candidates,
        key=lambda component: (
            max(vertices[index].z for index in component) - min(vertices[index].z for index in component),
            len(component),
        ),
    )
    selected = set(trunk_component)
    polygons = [polygon for polygon in branches.data.polygons if all(index in selected for index in polygon.vertices)]
    referenced_vertices = sorted({index for polygon in polygons for index in polygon.vertices})
    remap = {source_index: target_index for target_index, source_index in enumerate(referenced_vertices)}
    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata(
        [local_vertices[index] for index in referenced_vertices],
        [],
        [[remap[index] for index in polygon.vertices] for polygon in polygons],
    )
    mesh.update()
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = branches.matrix_world.copy()
    result.color = (0.28, 0.28, 0.28, 1.0)
    return result


def empty_part(name: str) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name} geometry")
    mesh.from_pydata([], [], [])
    mesh.update()
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    return result


def world_vertices(obj: bpy.types.Object) -> list[Vector]:
    matrix = obj.matrix_world
    return [matrix @ vertex.co for vertex in obj.data.vertices]


def align_model_to_ground_and_trunk(model: dict[str, bpy.types.Object]) -> None:
    branch_vertices = world_vertices(model["branches"])
    minimum_z = min(vertex.z for vertex in branch_vertices)
    maximum_z = max(vertex.z for vertex in branch_vertices)
    base_limit = minimum_z + (maximum_z - minimum_z) * 0.025
    base = [vertex for vertex in branch_vertices if vertex.z <= base_limit]
    base_center = sum(base, Vector()) / len(base)
    model["baseCenter"] = base_center
    model["minimumZ"] = minimum_z
    set_model_yaw(model, 0.0)


def set_model_yaw(model: dict[str, bpy.types.Object], yaw_degrees: float) -> None:
    yaw = math.radians(yaw_degrees)
    base_center = model["baseCenter"]
    rotated_base_x = math.cos(yaw) * base_center.x - math.sin(yaw) * base_center.y
    rotated_base_y = math.sin(yaw) * base_center.x + math.cos(yaw) * base_center.y
    model["root"].rotation_euler[2] = yaw
    model["root"].location = (-rotated_base_x, -rotated_base_y, -model["minimumZ"])


def configure_scene(orthographic_scale: float) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "OBJECT"
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = False
    scene.display.shading.show_specular_highlight = False
    scene.render.film_transparent = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    camera_data = bpy.data.cameras.new("Geometry parity orthographic camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = orthographic_scale
    camera = bpy.data.objects.new("Geometry parity orthographic camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def set_camera(camera: bpy.types.Object, direction: tuple[float, float, float]) -> None:
    target = Vector((0.0, 0.0, 7.0))
    camera.location = target + Vector(direction) * 24.0
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def set_visibility(
    source: dict[str, bpy.types.Object],
    reconstruction: dict[str, bpy.types.Object],
    active: str,
    part: str,
) -> None:
    for model_name, model in (("source", source), ("reconstruction", reconstruction)):
        inactive = model_name != active
        model["trunk"].hide_render = inactive or part != "trunk"
        model["primaryBranches"].hide_render = inactive or part != "primaryBranches"
        model["secondaryBranches"].hide_render = inactive or part != "secondaryBranches"
        model["branches"].hide_render = inactive or part != "all"
        model["leaves"].hide_render = inactive or part not in ("all", "leaves")


def render_mask(
    camera: bpy.types.Object,
    source: dict[str, bpy.types.Object],
    reconstruction: dict[str, bpy.types.Object],
    active: str,
    part: str,
    view: str,
    resolution: int,
    output_name: str | None = None,
) -> np.ndarray:
    set_visibility(source, reconstruction, active, part)
    set_camera(camera, CAMERA_VIEWS[view])
    scene = bpy.context.scene
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    output_path = OUTPUT_DIRECTORY / (output_name or "geometry-parity-working.png")
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    rendered = bpy.data.images.load(str(output_path), check_existing=False)
    pixels = np.array(rendered.pixels[:], dtype=np.float32).reshape(resolution, resolution, 4)
    bpy.data.images.remove(rendered)
    return pixels[:, :, 3] > 0.01


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    result = mask.copy()
    for offset_y in range(-radius, radius + 1):
        for offset_x in range(-radius, radius + 1):
            shifted = np.roll(np.roll(mask, offset_y, axis=0), offset_x, axis=1)
            if offset_y > 0:
                shifted[:offset_y, :] = False
            elif offset_y < 0:
                shifted[offset_y:, :] = False
            if offset_x > 0:
                shifted[:, :offset_x] = False
            elif offset_x < 0:
                shifted[:, offset_x:] = False
            result |= shifted
    return result


def tolerant_iou(left: np.ndarray, right: np.ndarray, radius: int) -> float:
    left_dilated = dilate(left, radius)
    right_dilated = dilate(right, radius)
    matched_left = np.logical_and(left, right_dilated).sum()
    matched_right = np.logical_and(right, left_dilated).sum()
    denominator = left.sum() + right.sum()
    return float((matched_left + matched_right) / denominator) if denominator else 1.0


def save_overlay(source_mask: np.ndarray, reconstruction_mask: np.ndarray, file_name: str) -> None:
    height, width = source_mask.shape
    pixels = np.zeros((height, width, 4), dtype=np.float32)
    overlap = np.logical_and(source_mask, reconstruction_mask)
    source_only = np.logical_and(source_mask, np.logical_not(reconstruction_mask))
    reconstruction_only = np.logical_and(reconstruction_mask, np.logical_not(source_mask))
    pixels[source_only] = (1.0, 0.12, 0.08, 1.0)
    pixels[reconstruction_only] = (0.0, 0.72, 1.0, 1.0)
    pixels[overlap] = (1.0, 1.0, 1.0, 1.0)
    image = bpy.data.images.new(file_name, width=width, height=height, alpha=True)
    image.pixels.foreach_set(pixels.reshape(-1))
    image.filepath_raw = str(OUTPUT_DIRECTORY / file_name)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def connected_components(obj: bpy.types.Object) -> list[list[int]]:
    adjacency = [set() for _ in obj.data.vertices]
    for polygon in obj.data.polygons:
        indices = list(polygon.vertices)
        for index, left in enumerate(indices):
            right = indices[(index + 1) % len(indices)]
            adjacency[left].add(right)
            adjacency[right].add(left)
    visited = set()
    components = []
    for start in range(len(adjacency)):
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        component = []
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


def quantile(values: list[float], probability: float) -> float:
    if not values:
        return 0.0
    return float(np.quantile(np.array(values, dtype=np.float64), probability))


def geometry_rules(model: dict[str, bpy.types.Object]) -> dict[str, object]:
    branches = model["branches"]
    leaves = model["leaves"]
    branch_vertices = world_vertices(branches)
    leaf_vertices = world_vertices(leaves)
    branch_components = connected_components(branches)
    primary_branch_components = connected_components(model["primaryBranches"])
    secondary_branch_components = connected_components(model["secondaryBranches"])
    leaf_components = connected_components(leaves)
    minimum_z = min(vertex.z for vertex in branch_vertices)
    maximum_z = max(vertex.z for vertex in branch_vertices)
    tree_height = maximum_z - minimum_z
    leaf_centers = []
    leaf_widths = []
    leaf_heights = []
    leaf_areas = []
    leaf_normal_up = []
    for component in leaf_components:
        points = [leaf_vertices[index] for index in component]
        center = sum(points, Vector()) / len(points)
        leaf_centers.append(center)
        pair_distances = sorted(
            (points[left] - points[right]).length
            for left in range(len(points))
            for right in range(left + 1, len(points))
        )
        edge_lengths = pair_distances[:4]
        leaf_widths.append(min(edge_lengths))
        leaf_heights.append(max(edge_lengths))
        leaf_areas.append(min(edge_lengths) * max(edge_lengths))
        if len(points) >= 3:
            normal = (points[1] - points[0]).cross(points[2] - points[0]).normalized()
            leaf_normal_up.append(abs(normal.z))
    heights = [(center.z - minimum_z) / tree_height for center in leaf_centers]
    radii = [math.hypot(center.x, center.y) / tree_height for center in leaf_centers]
    height_histogram, _ = np.histogram(heights, bins=12, range=(0.0, 1.05))
    branch_segments = []
    for component in branch_components:
        points = [branch_vertices[index] for index in component]
        component_minimum_z = min(point.z for point in points)
        component_height = max(point.z for point in points) - component_minimum_z
        root_limit = component_minimum_z + max(component_height * 0.02, 1e-5)
        root_points = [point for point in points if point.z <= root_limit]
        root = sum(root_points, Vector()) / len(root_points)
        tip = max(points, key=lambda point: (point - root).length_squared)
        branch_segments.append((root, tip))
    nearest_branch_distances = []
    branch_progresses = []
    leaves_per_branch = [0 for _ in branch_segments]
    for center in leaf_centers:
        candidates = []
        for branch_index, (root, tip) in enumerate(branch_segments):
            direction = tip - root
            length_squared = max(direction.length_squared, 1e-9)
            progress = min(1.0, max(0.0, (center - root).dot(direction) / length_squared))
            closest = root + direction * progress
            candidates.append(((center - closest).length, branch_index, progress))
        distance, branch_index, progress = min(candidates)
        nearest_branch_distances.append(distance / tree_height)
        branch_progresses.append(progress)
        leaves_per_branch[branch_index] += 1
    return {
        "treeHeight": tree_height,
        "branchConnectedComponents": len(branch_components),
        "primaryBranchConnectedComponents": len(primary_branch_components),
        "secondaryBranchConnectedComponents": len(secondary_branch_components),
        "leafCards": len(leaf_components),
        "lowestLeafHeightRatio": min(heights, default=0.0),
        "leafHeightQuantiles": [quantile(heights, value) for value in (0.1, 0.25, 0.5, 0.75, 0.9)],
        "leafRadiusQuantiles": [quantile(radii, value) for value in (0.1, 0.25, 0.5, 0.75, 0.9)],
        "leafCardWidthQuantiles": [quantile(leaf_widths, value) for value in (0.1, 0.5, 0.9)],
        "leafCardHeightQuantiles": [quantile(leaf_heights, value) for value in (0.1, 0.5, 0.9)],
        "leafCardAreaQuantiles": [quantile(leaf_areas, value) for value in (0.1, 0.5, 0.9)],
        "leafNormalAbsoluteUpQuantiles": [quantile(leaf_normal_up, value) for value in (0.1, 0.5, 0.9)],
        "leafHeightBins": height_histogram.tolist(),
        "leafNearestBranchDistanceQuantiles": [
            quantile(nearest_branch_distances, value) for value in (0.1, 0.25, 0.5, 0.75, 0.9)
        ],
        "leafBranchProgressQuantiles": [quantile(branch_progresses, value) for value in (0.1, 0.5, 0.9)],
        "terminalLeafRatio": sum(progress >= 0.75 for progress in branch_progresses) / max(len(branch_progresses), 1),
        "leafBearingBranchRatio": sum(count > 0 for count in leaves_per_branch) / len(leaves_per_branch),
        "leavesPerBranchQuantiles": [quantile(leaves_per_branch, value) for value in (0.1, 0.5, 0.9)],
    }


def normalized_l1(left: list[float], right: list[float]) -> float:
    left_values = np.array(left, dtype=np.float64)
    right_values = np.array(right, dtype=np.float64)
    normalization = max(float(np.abs(left_values).sum()), 1e-9)
    return float(np.abs(left_values - right_values).sum() / normalization)


def rule_errors(source: dict[str, object], reconstruction: dict[str, object]) -> dict[str, float]:
    scalar_fields = [
        "treeHeight",
        "branchConnectedComponents",
        "primaryBranchConnectedComponents",
        "secondaryBranchConnectedComponents",
        "leafCards",
        "lowestLeafHeightRatio",
    ]
    result = {
        field: abs(float(reconstruction[field]) - float(source[field])) / max(abs(float(source[field])), 1e-9)
        for field in scalar_fields
    }
    for field in (
        "leafHeightQuantiles",
        "leafRadiusQuantiles",
        "leafCardWidthQuantiles",
        "leafCardHeightQuantiles",
        "leafCardAreaQuantiles",
        "leafNormalAbsoluteUpQuantiles",
        "leafHeightBins",
        "leafNearestBranchDistanceQuantiles",
        "leafBranchProgressQuantiles",
        "leavesPerBranchQuantiles",
    ):
        result[field] = normalized_l1(source[field], reconstruction[field])
    for field in ("terminalLeafRatio", "leafBearingBranchRatio"):
        result[field] = abs(float(reconstruction[field]) - float(source[field])) / max(abs(float(source[field])), 1e-9)
    return result


def main() -> None:
    if not SOURCE_FBX.is_file():
        raise FileNotFoundError("Reference tree mesh is required")
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    clear_scene()
    source = split_model(import_source(), "source")
    reconstruction = split_model(import_reconstruction(), "reconstruction")
    source_branch_vertices = world_vertices(source["branches"])
    source_height = max(vertex.z for vertex in source_branch_vertices) - min(vertex.z for vertex in source_branch_vertices)
    orthographic_scale = max(source_height * 1.16, 0.1)
    camera = configure_scene(orthographic_scale)

    comparison_parts = ("trunk", "primaryBranches", "secondaryBranches", "all", "leaves")
    source_search_masks = {
        (view, part): render_mask(camera, source, reconstruction, "source", part, view, SEARCH_RESOLUTION)
        for view in CAMERA_VIEWS
        for part in comparison_parts
    }
    best_yaw = 0
    best_error = float("inf")
    for yaw in range(0, 360, 5):
        set_model_yaw(reconstruction, yaw)
        errors = []
        for view in CAMERA_VIEWS:
            reconstruction_mask = render_mask(
                camera, source, reconstruction, "reconstruction", "trunk", view, SEARCH_RESOLUTION
            )
            errors.append(1.0 - tolerant_iou(source_search_masks[(view, "trunk")], reconstruction_mask, 1))
        alignment_error = max(errors)
        if alignment_error < best_error:
            best_error = alignment_error
            best_yaw = yaw

    set_model_yaw(reconstruction, best_yaw)
    visual_views = {}
    for view in CAMERA_VIEWS:
        view_metrics = {}
        for part in comparison_parts:
            suffix = "geometry" if part == "all" else part
            source_mask = render_mask(
                camera,
                source,
                reconstruction,
                "source",
                part,
                view,
                FINAL_RESOLUTION,
                f"geometry-source-{view}-{suffix}.png",
            )
            reconstruction_mask = render_mask(
                camera,
                source,
                reconstruction,
                "reconstruction",
                part,
                view,
                FINAL_RESOLUTION,
                f"geometry-reconstruction-{view}-{suffix}.png",
            )
            tolerance = MASK_TOLERANCE_PIXELS if part == "leaves" else MASK_TOLERANCE_PIXELS + 1
            similarity = tolerant_iou(source_mask, reconstruction_mask, tolerance)
            view_metrics[part] = {"similarity": similarity, "error": 1.0 - similarity}
            save_overlay(source_mask, reconstruction_mask, f"geometry-overlay-{view}-{suffix}.png")
            if part == "all":
                save_overlay(source_mask, reconstruction_mask, f"geometry-overlay-{view}.png")
        visual_views[view] = view_metrics

    source_rules = geometry_rules(source)
    reconstruction_rules = geometry_rules(reconstruction)
    errors = rule_errors(source_rules, reconstruction_rules)
    visual_errors = [metrics[part]["error"] for metrics in visual_views.values() for part in metrics]
    stage_visual_maximum_errors = {
        "trunk": max(metrics["trunk"]["error"] for metrics in visual_views.values()),
        "primaryBranches": max(
            metrics["primaryBranches"]["error"] for metrics in visual_views.values()
        ),
        "secondaryBranches": max(
            metrics["secondaryBranches"]["error"] for metrics in visual_views.values()
        ),
        # The leaf stage is the final species assembly gate, so it must preserve
        # leaf-card parity and the complete trunk + branches + leaves silhouette.
        "leaves": max(
            max(metrics[part]["error"] for metrics in visual_views.values())
            for part in ("leaves", "all")
        ),
    }
    rule_maximum_error = max(errors.values())
    visual_maximum_error = max(visual_errors)
    report = {
        "schema": "galacean/procedural-tree-material-free-visual-parity-v1",
        "reconstructionSource": "direct procedural runtime geometry stream",
        "materialPolicy": "All source and reconstruction materials are ignored; identical flat diagnostic colors are used.",
        "alignment": {
            "groundAndTrunkBaseTranslation": True,
            "uniformScaleApplied": False,
            "bestYawDegrees": best_yaw,
            "views": list(CAMERA_VIEWS),
            "orthographicScale": orthographic_scale,
            "pixelTolerance": MASK_TOLERANCE_PIXELS,
        },
        "sourceRules": source_rules,
        "reconstructionRules": reconstruction_rules,
        "ruleErrors": errors,
        "visualViews": visual_views,
        "comparisonOrder": ["trunk", "primaryBranches", "secondaryBranches", "leaves"],
        "stageVisualMaximumErrors": stage_visual_maximum_errors,
        "visualMaximumError": visual_maximum_error,
        "visualMeanError": sum(visual_errors) / len(visual_errors),
        "ruleMaximumError": rule_maximum_error,
        # The hard user-facing constraint is explicitly a source/reconstruction pixel comparison.
        # Rule metrics remain diagnostics and are evaluated separately by the staged offline fitter.
        "passesFivePercent": visual_maximum_error <= 0.05,
        "ruleDiagnosticsPassFivePercent": rule_maximum_error <= 0.05,
    }
    (OUTPUT_DIRECTORY / "geometry-visual-parity.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    working_image = OUTPUT_DIRECTORY / "geometry-parity-working.png"
    if working_image.exists():
        working_image.unlink()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
