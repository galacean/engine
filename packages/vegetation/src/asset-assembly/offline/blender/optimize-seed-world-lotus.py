#!/usr/bin/env python3
"""Reduce selected Seed World lotus GLB primitives with Blender.

Run through Blender so its glTF importer/exporter and Decimate modifier own the
geometry rewrite:

  Blender --background --factory-startup \
    --python optimize-seed-world-lotus.py -- \
    --input lotus-group-2-lod1.glb \
    --output lotus-group-2-lod1-optimized.glb \
    --primitive-ratio 1:0.3

The source GLBs intentionally contain no materials. Temporary placeholder
materials keep the leaf and flower primitives separate during the Blender
round-trip; they are removed from the optimized output again.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import tempfile
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


GLB_MAGIC = b"glTF"
GLB_VERSION = 2
JSON_CHUNK_TYPE = 0x4E4F534A
BIN_CHUNK_TYPE = 0x004E4942
PLACEHOLDER_MATERIAL_PREFIX = "seed-world-lotus-slot-"


def parse_arguments() -> argparse.Namespace:
    blender_arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--primitive-ratio",
        action="append",
        default=[],
        metavar="INDEX:RATIO",
        help="Decimate one zero-based primitive to the given ratio; repeat for multiple primitives",
    )
    parser.add_argument(
        "--flower-petal-stride",
        type=int,
        help=(
            "Keep every Nth intact petal in each of the three eight-petal rings across the four "
            "flower heads in primitive 1"
        ),
    )
    arguments = parser.parse_args(blender_arguments)
    arguments.primitive_ratios = parse_primitive_ratios(arguments.primitive_ratio)
    if arguments.flower_petal_stride is not None:
        if arguments.flower_petal_stride < 2:
            raise ValueError("--flower-petal-stride must be at least 2")
        if arguments.primitive_ratios:
            raise ValueError("Petal thinning and Decimate ratios are mutually exclusive")
    elif not arguments.primitive_ratios:
        raise ValueError("Specify --flower-petal-stride or at least one --primitive-ratio")
    return arguments


def parse_primitive_ratios(values: list[str]) -> dict[int, float]:
    ratios: dict[int, float] = {}
    for value in values:
        try:
            primitive_text, ratio_text = value.split(":", 1)
            primitive_index = int(primitive_text)
            ratio = float(ratio_text)
        except ValueError as error:
            raise ValueError(f"Invalid --primitive-ratio '{value}'; expected INDEX:RATIO") from error
        if primitive_index < 0:
            raise ValueError("Primitive indices must be non-negative")
        if not math.isfinite(ratio) or ratio <= 0 or ratio > 1:
            raise ValueError("Primitive ratios must be in the interval (0, 1]")
        ratios[primitive_index] = ratio
    return ratios


def read_glb(path: Path) -> tuple[dict[str, Any], list[tuple[int, bytes]]]:
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != GLB_MAGIC:
        raise ValueError(f"'{path}' is not a GLB file")
    version, declared_length = struct.unpack_from("<II", payload, 4)
    if version != GLB_VERSION or declared_length != len(payload):
        raise ValueError(f"'{path}' has an invalid GLB header")

    chunks: list[tuple[int, bytes]] = []
    offset = 12
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunk_start = offset + 8
        chunk_end = chunk_start + chunk_length
        if chunk_end > len(payload):
            raise ValueError(f"'{path}' has a truncated GLB chunk")
        chunks.append((chunk_type, payload[chunk_start:chunk_end]))
        offset = chunk_end

    if not chunks or chunks[0][0] != JSON_CHUNK_TYPE:
        raise ValueError(f"'{path}' has no leading JSON chunk")
    document = json.loads(chunks[0][1].decode("utf-8").rstrip(" \t\r\n\0"))
    return document, chunks[1:]


def write_glb(path: Path, document: dict[str, Any], chunks: list[tuple[int, bytes]]) -> None:
    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((-len(json_payload)) % 4)
    encoded_chunks = [(JSON_CHUNK_TYPE, json_payload), *chunks]
    total_length = 12 + sum(8 + len(payload) for _, payload in encoded_chunks)
    output = bytearray(struct.pack("<4sII", GLB_MAGIC, GLB_VERSION, total_length))
    for chunk_type, payload in encoded_chunks:
        output.extend(struct.pack("<II", len(payload), chunk_type))
        output.extend(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output)


def add_placeholder_materials(document: dict[str, Any]) -> int:
    meshes = document.get("meshes", [])
    if len(meshes) != 1:
        raise ValueError(f"Expected one lotus mesh, found {len(meshes)}")
    primitives = meshes[0].get("primitives", [])
    if not primitives:
        raise ValueError("Lotus mesh has no primitives")
    document["materials"] = [
        {
            "name": f"{PLACEHOLDER_MATERIAL_PREFIX}{index}",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.25 + 0.5 * (index % 2), 0.65, 0.25, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 1.0,
            },
        }
        for index in range(len(primitives))
    ]
    for index, primitive in enumerate(primitives):
        primitive["material"] = index
    return len(primitives)


def mesh_objects() -> list[bpy.types.Object]:
    return [item for item in bpy.context.scene.objects if item.type == "MESH"]


def activate_only(item: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item


def material_slot_index(item: bpy.types.Object) -> int:
    used_indices = {polygon.material_index for polygon in item.data.polygons}
    used_names = {
        item.material_slots[index].material.name
        for index in used_indices
        if index < len(item.material_slots) and item.material_slots[index].material is not None
    }
    placeholder_names = [name for name in used_names if name.startswith(PLACEHOLDER_MATERIAL_PREFIX)]
    if len(placeholder_names) != 1:
        raise ValueError(f"Could not resolve one source primitive for Blender object '{item.name}': {used_names}")
    return int(placeholder_names[0][len(PLACEHOLDER_MATERIAL_PREFIX) :])


def split_mesh_by_primitive(item: bpy.types.Object, primitive_count: int) -> dict[int, bpy.types.Object]:
    activate_only(item)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")

    separated: dict[int, bpy.types.Object] = {}
    for mesh_item in mesh_objects():
        index = material_slot_index(mesh_item)
        if index in separated:
            raise ValueError(f"Primitive {index} produced more than one Blender object")
        separated[index] = mesh_item
    if set(separated) != set(range(primitive_count)):
        raise ValueError(f"Blender lost lotus primitives: found {sorted(separated)}, expected {list(range(primitive_count))}")
    return separated


def remove_unused_material_slots(item: bpy.types.Object) -> None:
    activate_only(item)
    bpy.ops.object.material_slot_remove_unused()


def decimate(item: bpy.types.Object, ratio: float) -> tuple[int, int]:
    before = len(item.data.polygons)
    if ratio < 1:
        activate_only(item)
        modifier = item.modifiers.new(name="Seed World lotus offline decimation", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = len(item.data.polygons)
    if after <= 0 or after > before:
        raise ValueError(f"Invalid decimation result for '{item.name}': {before} -> {after}")
    return before, after


def connected_face_components(item: bpy.types.Object) -> list[dict[str, Any]]:
    vertex_faces: dict[int, list[int]] = {vertex.index: [] for vertex in item.data.vertices}
    for polygon in item.data.polygons:
        for vertex_index in polygon.vertices:
            vertex_faces[vertex_index].append(polygon.index)

    unseen = {polygon.index for polygon in item.data.polygons}
    components: list[dict[str, Any]] = []
    while unseen:
        pending = [min(unseen)]
        unseen.remove(pending[0])
        face_indices: list[int] = []
        vertex_indices: set[int] = set()
        while pending:
            face_index = pending.pop()
            face_indices.append(face_index)
            polygon = item.data.polygons[face_index]
            for vertex_index in polygon.vertices:
                vertex_indices.add(vertex_index)
                for neighbour in vertex_faces[vertex_index]:
                    if neighbour in unseen:
                        unseen.remove(neighbour)
                        pending.append(neighbour)
        centroid = sum(
            (item.data.vertices[index].co for index in vertex_indices),
            start=Vector((0.0, 0.0, 0.0)),
        ) / len(vertex_indices)
        components.append(
            {
                "faces": face_indices,
                "vertices": vertex_indices,
                "centroid": centroid,
            }
        )
    return components


def cluster_flower_heads(components: list[dict[str, Any]], cluster_count: int) -> list[list[dict[str, Any]]]:
    def horizontal_distance_squared(left: Vector, right: Vector) -> float:
        return (left.x - right.x) ** 2 + (left.y - right.y) ** 2

    first = min(components, key=lambda component: (component["centroid"].x, component["centroid"].y))
    centers = [first["centroid"].copy()]
    while len(centers) < cluster_count:
        candidate = max(
            components,
            key=lambda component: min(
                horizontal_distance_squared(component["centroid"], center) for center in centers
            ),
        )
        centers.append(candidate["centroid"].copy())

    clusters: list[list[dict[str, Any]]] = []
    for _ in range(32):
        clusters = [[] for _ in range(cluster_count)]
        for component in components:
            cluster_index = min(
                range(cluster_count),
                key=lambda index: horizontal_distance_squared(component["centroid"], centers[index]),
            )
            clusters[cluster_index].append(component)
        updated = [
            sum((component["centroid"] for component in cluster), start=Vector((0.0, 0.0, 0.0)))
            / len(cluster)
            for cluster in clusters
        ]
        if all(horizontal_distance_squared(left, right) < 1e-16 for left, right in zip(centers, updated)):
            break
        centers = updated

    paired = sorted(zip(centers, clusters), key=lambda pair: (pair[0].x, pair[0].y))
    return [cluster for _, cluster in paired]


def thin_flower_petals(item: bpy.types.Object, stride: int) -> tuple[int, int, dict[str, Any]]:
    before = len(item.data.polygons)
    components = connected_face_components(item)
    clusters = cluster_flower_heads(components, 4)
    if [len(cluster) for cluster in clusters] != [24, 24, 24, 24]:
        raise ValueError(
            "Seed World lotus-group-2 flower topology changed; expected four heads with 24 petals each, found "
            f"{[len(cluster) for cluster in clusters]}"
        )

    removed_vertices: set[int] = set()
    kept_by_head: list[int] = []
    for cluster in clusters:
        center = sum(
            (component["centroid"] for component in cluster),
            start=Vector((0.0, 0.0, 0.0)),
        ) / len(cluster)
        radial = sorted(
            cluster,
            key=lambda component: math.hypot(
                component["centroid"].x - center.x,
                component["centroid"].y - center.y,
            ),
        )
        kept = 0
        for ring_index in range(3):
            ring = radial[ring_index * 8 : (ring_index + 1) * 8]
            angular = sorted(
                ring,
                key=lambda component: math.atan2(
                    component["centroid"].y - center.y,
                    component["centroid"].x - center.x,
                ),
            )
            for angular_index, component in enumerate(angular):
                if (angular_index + ring_index) % stride == 0:
                    kept += 1
                else:
                    removed_vertices.update(component["vertices"])
        kept_by_head.append(kept)

    activate_only(item)
    for vertex in item.data.vertices:
        vertex.select = vertex.index in removed_vertices
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    item.data.update()
    after = len(item.data.polygons)
    if after <= 0 or after >= before:
        raise ValueError(f"Invalid flower petal thinning result: {before} -> {after}")
    return before, after, {
        "method": "intact-petal-stride",
        "stride": stride,
        "heads": len(clusters),
        "sourcePetalsPerHead": 24,
        "keptPetalsByHead": kept_by_head,
    }


def join_in_primitive_order(items: dict[int, bpy.types.Object]) -> bpy.types.Object:
    for item in items.values():
        remove_unused_material_slots(item)
    ordered = [items[index] for index in sorted(items)]
    bpy.ops.object.select_all(action="DESELECT")
    for item in ordered:
        item.select_set(True)
    bpy.context.view_layer.objects.active = ordered[0]
    if len(ordered) > 1:
        bpy.ops.object.join()
    joined = ordered[0]
    joined.name = "seed-world-lotus-optimized"
    return joined


def export_glb(item: bpy.types.Object, path: Path) -> None:
    activate_only(item)
    result = bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_tangents=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender glTF export failed: {result}")


def strip_placeholder_materials(path: Path, expected_primitive_count: int) -> dict[str, Any]:
    document, chunks = read_glb(path)
    meshes = document.get("meshes", [])
    if len(meshes) != 1:
        raise ValueError(f"Blender exported {len(meshes)} meshes instead of one")
    primitives = meshes[0].get("primitives", [])
    if len(primitives) != expected_primitive_count:
        raise ValueError(
            f"Blender exported {len(primitives)} primitives instead of {expected_primitive_count}"
        )
    materials = document.get("materials", [])
    ordered_material_names = [
        materials[primitive["material"]].get("name", "") if "material" in primitive else ""
        for primitive in primitives
    ]
    expected_names = [f"{PLACEHOLDER_MATERIAL_PREFIX}{index}" for index in range(expected_primitive_count)]
    if ordered_material_names != expected_names:
        raise ValueError(
            f"Blender changed primitive order: found {ordered_material_names}, expected {expected_names}"
        )

    required_attributes = {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"}
    for index, primitive in enumerate(primitives):
        missing = required_attributes - set(primitive.get("attributes", {}))
        if missing:
            raise ValueError(f"Primitive {index} lost required attributes: {sorted(missing)}")
        primitive.pop("material", None)
    document.pop("materials", None)
    document.pop("textures", None)
    document.pop("images", None)
    document.pop("samplers", None)
    write_glb(path, document, chunks)
    return glb_metrics(document)


def glb_metrics(document: dict[str, Any]) -> dict[str, Any]:
    accessors = document.get("accessors", [])
    position_accessors: set[int] = set()
    triangles_by_primitive: list[int] = []
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_index = primitive["attributes"]["POSITION"]
            position_accessors.add(position_index)
            position = accessors[position_index]
            for axis in range(3):
                minimum[axis] = min(minimum[axis], position["min"][axis])
                maximum[axis] = max(maximum[axis], position["max"][axis])
            indices = accessors[primitive["indices"]]
            if primitive.get("mode", 4) != 4 or indices["count"] % 3 != 0:
                raise ValueError("Optimized lotus output must remain indexed triangles")
            triangles_by_primitive.append(indices["count"] // 3)
    return {
        "vertices": sum(accessors[index]["count"] for index in position_accessors),
        "triangles": sum(triangles_by_primitive),
        "trianglesByPrimitive": triangles_by_primitive,
        "primitiveCount": len(triangles_by_primitive),
        "bounds": {"minimum": minimum, "maximum": maximum},
    }


def main() -> None:
    arguments = parse_arguments()
    input_path = arguments.input.resolve()
    output_path = arguments.output.resolve()
    source_document, source_chunks = read_glb(input_path)
    source_metrics = glb_metrics(source_document)
    primitive_count = add_placeholder_materials(source_document)
    invalid_indices = sorted(set(arguments.primitive_ratios) - set(range(primitive_count)))
    if invalid_indices:
        raise ValueError(f"Primitive indices do not exist: {invalid_indices}")

    with tempfile.TemporaryDirectory(prefix="seed-world-lotus-blender-") as temporary_directory:
        temporary_input = Path(temporary_directory) / "input-with-materials.glb"
        temporary_output = Path(temporary_directory) / "optimized-with-materials.glb"
        write_glb(temporary_input, source_document, source_chunks)

        bpy.ops.wm.read_factory_settings(use_empty=True)
        result = bpy.ops.import_scene.gltf(filepath=str(temporary_input))
        if "FINISHED" not in result:
            raise RuntimeError(f"Blender glTF import failed: {result}")
        imported = mesh_objects()
        if len(imported) != 1:
            raise ValueError(f"Blender imported {len(imported)} meshes instead of one")
        separated = split_mesh_by_primitive(imported[0], primitive_count)
        reductions: dict[int, dict[str, Any]] = {}
        if arguments.flower_petal_stride is not None:
            if primitive_count != 2:
                raise ValueError("Flower petal thinning requires the two-primitive lotus-group-2 asset")
            before, after, details = thin_flower_petals(separated[1], arguments.flower_petal_stride)
            reductions[1] = {**details, "before": before, "after": after}
        else:
            for index, ratio in sorted(arguments.primitive_ratios.items()):
                before, after = decimate(separated[index], ratio)
                reductions[index] = {"method": "decimate", "ratio": ratio, "before": before, "after": after}
        joined = join_in_primitive_order(separated)
        export_glb(joined, temporary_output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(temporary_output.read_bytes())

    output_metrics = strip_placeholder_materials(output_path, primitive_count)
    print(
        "SEED_WORLD_LOTUS_OPTIMIZATION="
        + json.dumps(
            {
                "input": str(input_path),
                "output": str(output_path),
                "source": source_metrics,
                "optimized": output_metrics,
                "reductions": reductions,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
