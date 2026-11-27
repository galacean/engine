"""Build geometry-only LOD candidates for a static, single-primitive GLB."""
import argparse
import json
from pathlib import Path
import struct
import sys
import tempfile

import bpy
import numpy as np


def read_glb(path):
    data = path.read_bytes()
    magic, version, length, json_size, kind = struct.unpack_from("<4sIII4s", data)
    if (magic, version, length, kind) != (b"glTF", 2, len(data), b"JSON"):
        raise ValueError(f"Expected a GLB 2.0 file: {path}")
    offset = 20 + json_size
    bin_size, bin_kind = struct.unpack_from("<I4s", data, offset)
    if bin_kind != b"BIN\0" or offset + 8 + bin_size != length:
        raise ValueError(f"Expected one embedded binary buffer: {path}")
    return json.loads(data[20:offset]), bytearray(data[offset + 8:])


def write_glb(path, document, binary):
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    header = struct.pack("<4sIII4s", b"glTF", 2, 28 + len(encoded) + len(binary), len(encoded), b"JSON")
    path.write_bytes(header + encoded + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def primitive(document):
    meshes = document["meshes"]
    nodes = document["nodes"]
    if len(meshes) != 1 or len(meshes[0]["primitives"]) != 1 or len(nodes) != 1:
        raise ValueError("Expected one static mesh primitive on one root node")
    if (
        nodes[0].get("mesh") != 0 or
        {"translation", "rotation", "scale", "matrix", "skin"} & nodes[0].keys()
        or document.get("animations")
    ):
        raise ValueError("Bake root transforms first and use a static asset")
    result = meshes[0]["primitives"][0]
    if (
        result.get("mode", 4) != 4 or "indices" not in result or result.get("targets")
        or not {"POSITION", "NORMAL", "TEXCOORD_0"} <= result["attributes"].keys()
    ):
        raise ValueError("Expected an indexed triangle primitive with positions, normals and UV0")
    return result


def values(document, binary, attribute):
    accessor = document["accessors"][primitive(document)["attributes"][attribute]]
    view = document["bufferViews"][accessor["bufferView"]]
    if view["buffer"] != 0 or "sparse" in accessor or "extensions" in view:
        raise ValueError(f"Unsupported packed or sparse accessor: {attribute}")
    dtype = np.dtype({5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5126: "<f4"}[accessor["componentType"]])
    dimensions = int(accessor["type"][-1])
    array = np.ndarray(
        (accessor["count"], dimensions), dtype=dtype, buffer=binary,
        offset=view.get("byteOffset", 0) + accessor.get("byteOffset", 0),
        strides=(view.get("byteStride", dimensions * dtype.itemsize), dtype.itemsize),
    )
    if accessor.get("normalized") and dtype.kind in "iu":
        return np.maximum(-1, array.astype(float) / np.iinfo(dtype).max)
    return array


def triangle_count(document):
    return document["accessors"][primitive(document)["indices"]]["count"] // 3


def carry_tangents(source, original_binary, result, binary):
    if "TANGENT" not in primitive(source)["attributes"]:
        return
    source_positions = values(source, original_binary, "POSITION")
    factor = float(np.ptp(source_positions, axis=0).max())
    if not factor:
        raise ValueError("Source geometry has empty bounds")
    # Match by position and UV. Normals disambiguate coincident corners at hard edges.
    source_feature = np.column_stack((source_positions, values(source, original_binary, "TEXCOORD_0") * factor))
    feature = np.column_stack((values(result, binary, "POSITION"), values(result, binary, "TEXCOORD_0") * factor))
    source_normal = values(source, original_binary, "NORMAL")
    target_normals = values(result, binary, "NORMAL")
    tangents = values(result, binary, "TANGENT")
    original_tangents = values(source, original_binary, "TANGENT")
    batch = max(1, min(128, 500_000 // len(source_positions)))
    for start in range(0, len(feature), batch):
        end = start + batch
        delta = feature[start:end, None, :] - source_feature[None, :, :]
        distances = np.einsum("ijk,ijk->ij", delta, delta)
        orientation = np.clip(target_normals[start:end] @ source_normal.T, -1, 1)
        distances += (1 - orientation) * (0.001 * factor * factor)
        tangents[start:end] = original_tangents[np.argmin(distances, axis=1)]


def build_candidate(obj, ratio, output):
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    bpy.context.collection.objects.link(duplicate)
    bpy.ops.object.select_all(action="DESELECT")
    duplicate.select_set(True)
    bpy.context.view_layer.objects.active = duplicate
    decimate = duplicate.modifiers.new("LOD Decimate", "DECIMATE")
    decimate.ratio = ratio
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    transfer = duplicate.modifiers.new("Preserve source corner normals", "DATA_TRANSFER")
    transfer.object = obj
    transfer.use_loop_data = True
    transfer.data_types_loops = {"CUSTOM_NORMAL"}
    transfer.loop_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="NONE", export_animations=False,
    )
    mesh = duplicate.data
    bpy.data.objects.remove(duplicate, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--ratio", type=float, action="append", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    ratios = sorted(set(args.ratio), reverse=True)
    if not all(0 < ratio < 1 for ratio in ratios):
        parser.error("Each ratio must be strictly between 0 and 1")
    source = args.input.resolve()
    output = args.out.resolve()
    names = [f"lod{i}.glb" for i in range(1, len(ratios) + 1)]
    if any((output / name).exists() for name in [*names, "asset.json"]):
        parser.error("The output already contains LOD files. Use a fresh directory.")

    original, original_binary = read_glb(source)
    original_primitive = primitive(original)
    positions = values(original, original_binary, "POSITION")
    center = ((positions.min(axis=0) + positions.max(axis=0)) / 2).tolist()
    size = float(np.ptp(positions, axis=0).max())
    clean, clean_binary = read_glb(source)
    for key in ("materials", "textures", "images", "samplers", "extras"):
        clean.pop(key, None)
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in clean:
            clean[key] = [extension for extension in clean[key] if extension != "KHR_texture_basisu"]
    primitive(clean).pop("material", None)
    with tempfile.TemporaryDirectory() as work:
        temp = Path(work)
        geometry = temp / "source.glb"
        write_glb(geometry, clean, clean_binary)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(geometry), merge_vertices=True)
        obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
        source_count = triangle_count(original)
        levels = [{"id": "lod0", "path": str(source), "triangles": source_count}]
        for name, ratio in zip(names, ratios):
            path = temp / name
            build_candidate(obj, ratio, path)
            result, binary = read_glb(path)
            if "TANGENT" in original_primitive["attributes"]:
                carry_tangents(original, original_binary, result, binary)
            count = triangle_count(result)
            if not 0 < count < source_count:
                raise ValueError(f"{name} produced {count} triangles from {source_count}")
            write_glb(path, result, binary)
            levels.append({"id": path.stem, "path": name, "ratio": ratio, "triangles": count})
        output.mkdir(parents=True, exist_ok=True)
        for name in names:
            (output / name).write_bytes((temp / name).read_bytes())
        (output / "asset.json").write_text(json.dumps({"center": center, "size": size, "levels": levels}, indent=2) + "\n")


if __name__ == "__main__":
    main()
