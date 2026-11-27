"""Extract a material-independent procedural reconstruction blueprint from a tree mesh.

The source branch tubes are reduced to ordered centerlines and radii.  Leaf quads are
stored as root pivots plus two card axes, rather than copied triangle vertices.  The
runtime generator therefore rebuilds both tubes and cards from measured geometric
data while remaining independent of the FBX and its materials.
"""

from __future__ import annotations

import json
import math
import argparse
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
DEFAULT_OUTPUT_PATH = (
    SCRIPT_DIRECTORY.parent
    / "generated"
    / "procedural-trees"
    / "measured-white-birch"
    / ".source-geometry-analysis.json"
)
def engine_point(point: Vector, origin: Vector) -> list[float]:
    aligned = point - origin
    # Blender's FBX importer is Z-up; Galacean is Y-up.
    return rounded((aligned.x, aligned.z, -aligned.y))


def rounded(values, digits: int = 7) -> list[float]:
    return [round(float(value), digits) for value in values]


def quantile(values: list[float], probability: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def quantiles(values: list[float], probabilities=(0.1, 0.25, 0.5, 0.75, 0.9)) -> list[float]:
    return [round(quantile(values, probability), 7) for probability in probabilities]


def material_faces(obj: bpy.types.Object, index: int) -> list[bpy.types.MeshPolygon]:
    return [polygon for polygon in obj.data.polygons if polygon.material_index == index]


def face_components(faces: list[bpy.types.MeshPolygon]) -> list[list[int]]:
    adjacency: dict[int, set[int]] = defaultdict(set)
    for polygon in faces:
        vertices = list(polygon.vertices)
        for left, right in zip(vertices, vertices[1:] + vertices[:1]):
            adjacency[left].add(right)
            adjacency[right].add(left)
    visited: set[int] = set()
    components = []
    for start in adjacency:
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        component = []
        while stack:
            vertex = stack.pop()
            component.append(vertex)
            for neighbor in adjacency[vertex]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


def material_role_indices(obj: bpy.types.Object) -> tuple[int, int | None]:
    """Identify woody support geometry independently of the supported foliage compiler.

    A triangulated tube can also be partitioned into UV quads. Conversely, a
    valid foliage surface need not be a quad. Neither observation identifies a
    material role. Resolve support paths first, with bark/wood names as hints;
    unsupported foliage is then rejected by its own geometry extractor.
    """
    entries = []
    for index, slot in enumerate(obj.material_slots):
        faces = material_faces(obj, index)
        if not faces:
            continue
        name = slot.material.name.lower() if slot.material else ""
        try:
            paths = extract_unoriented_branch_paths(obj, faces)
            longest_path = max((polyline_length(path["centers"]) for path in paths), default=0.0)
        except RuntimeError:
            longest_path = 0.0
        entries.append((index, name, longest_path))
    if not entries:
        raise RuntimeError(f"{obj.name} does not contain material-bound tree geometry")
    tubes = [entry for entry in entries if entry[2] > 0.0]
    named_wood = [entry for entry in tubes if any(word in entry[1] for word in ("bark", "trunk", "wood"))]
    candidates = named_wood or tubes
    if not candidates:
        raise RuntimeError(f"Could not resolve woody support paths in {[entry[1] for entry in entries]}")
    # The trunk is the longest support path; foliage fan topology alone can
    # resemble a short capped tube and must not win by total vertex count.
    branch_index = max(candidates, key=lambda entry: entry[2])[0]
    foliage = [entry for entry in entries if entry[0] != branch_index]
    if len(foliage) > 1:
        raise RuntimeError("Tree blueprint requires a single foliage material; found " + str([entry[1] for entry in foliage]))
    return branch_index, foliage[0][0] if foliage else None


def triangulated_leaf_card_components(
    obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon]
) -> list[set[int]] | None:
    if not faces or any(len(face.vertices) != 3 for face in faces) or obj.data.uv_layers.active is None:
        return None
    uv_data = obj.data.uv_layers.active.data
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    edge_uvs: dict[tuple[int, int], tuple[Vector, Vector]] = {}
    for face_index, face in enumerate(faces):
        vertices = list(face.vertices)
        loops = list(face.loop_indices)
        for edge_index, (left, right) in enumerate(zip(vertices, vertices[1:] + vertices[:1])):
            edge = tuple(sorted((left, right)))
            edge_faces[edge].append(face_index)
            left_loop = loops[edge_index]
            right_loop = loops[(edge_index + 1) % len(loops)]
            edge_uvs.setdefault(edge, (uv_data[left_loop].uv.copy(), uv_data[right_loop].uv.copy()))
    candidates = []
    for edge, face_indices in edge_faces.items():
        if len(face_indices) != 2:
            continue
        left_uv, right_uv = edge_uvs[edge]
        delta_u = abs(float(left_uv.x - right_uv.x))
        delta_v = abs(float(left_uv.y - right_uv.y))
        vertices = set(faces[face_indices[0]].vertices) | set(faces[face_indices[1]].vertices)
        if len(vertices) == 4 and delta_u > 1e-5 and delta_v > 1e-5:
            candidates.append((delta_u * delta_v, face_indices[0], face_indices[1], vertices))
    candidates.sort(reverse=True)
    used: set[int] = set()
    cards = []
    for _, left, right, vertices in candidates:
        if left in used or right in used:
            continue
        used.update((left, right))
        cards.append(vertices)
    return cards if len(used) == len(faces) else None


def leaf_card_components(obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon]) -> list[set[int]]:
    if not faces:
        return []
    components = [set(component) for component in face_components(faces)]
    if components and all(len(component) == 4 for component in components):
        return components
    triangulated = triangulated_leaf_card_components(obj, faces)
    if triangulated is not None:
        return triangulated
    malformed = [len(component) for component in components if len(component) != 4]
    raise RuntimeError(f"Leaf cards require quads or paired UV triangles; received component sizes {malformed[:8]}")


def can_extract_leaf_cards(obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon]) -> bool:
    try:
        leaf_card_components(obj, faces)
        return True
    except RuntimeError:
        return False


def leaf_card_count(obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon]) -> int:
    return len(leaf_card_components(obj, faces))


def boundary_loops(
    component: set[int], faces: list[bpy.types.MeshPolygon]
) -> tuple[list[list[int]], dict[int, set[int]]]:
    edge_counts: Counter[tuple[int, int]] = Counter()
    adjacency: dict[int, set[int]] = defaultdict(set)
    for polygon in faces:
        if polygon.vertices[0] not in component:
            continue
        vertices = list(polygon.vertices)
        for left, right in zip(vertices, vertices[1:] + vertices[:1]):
            edge = tuple(sorted((left, right)))
            edge_counts[edge] += 1
            adjacency[left].add(right)
            adjacency[right].add(left)
    boundary_adjacency: dict[int, set[int]] = defaultdict(set)
    for (left, right), count in edge_counts.items():
        if count == 1:
            boundary_adjacency[left].add(right)
            boundary_adjacency[right].add(left)
    loops = []
    visited: set[int] = set()
    for start in boundary_adjacency:
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        loop = []
        while stack:
            vertex = stack.pop()
            loop.append(vertex)
            for neighbor in boundary_adjacency[vertex]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        loops.append(loop)
    return loops, adjacency


def distances_from(vertices: list[int], adjacency: dict[int, set[int]]) -> dict[int, int]:
    distances = {vertex: 0 for vertex in vertices}
    queue = deque(vertices)
    while queue:
        vertex = queue.popleft()
        for neighbor in adjacency[vertex]:
            if neighbor not in distances:
                distances[neighbor] = distances[vertex] + 1
                queue.append(neighbor)
    return distances


def mean_point(points: list[Vector]) -> Vector:
    return sum(points, Vector()) / len(points)


def polyline_length(points: list[Vector]) -> float:
    return sum((points[index + 1] - points[index]).length for index in range(len(points) - 1))


def extract_unoriented_branch_paths(
    obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon]
) -> list[dict[str, object]]:
    world = obj.matrix_world
    vertices = [world @ vertex.co for vertex in obj.data.vertices]
    paths = []
    for component_values in face_components(faces):
        component = set(component_values)
        loops, adjacency = boundary_loops(component, faces)
        if len(loops) not in (1, 2) or (len(loops) == 2 and len(loops[0]) != len(loops[1])):
            raise RuntimeError(
                f"Branch tube requires one open ring plus a capped tip, or two equal boundary rings; received {[len(loop) for loop in loops]}"
            )
        radial_sides = len(loops[0])
        if radial_sides < 3 or radial_sides > 32:
            raise RuntimeError(f"Branch tube radial side count must be within 3..32; received {radial_sides}")
        distances = distances_from(loops[0], adjacency)
        rings: dict[int, list[int]] = defaultdict(list)
        for vertex in component:
            rings[distances[vertex]].append(vertex)
        ordered_distances = sorted(rings)
        capped_tip_distance = (
            ordered_distances[-1]
            if len(loops) == 1 and len(rings[ordered_distances[-1]]) < radial_sides
            else None
        )
        if any(
            len(ring) != radial_sides and distance != capped_tip_distance
            for distance, ring in rings.items()
        ):
            raise RuntimeError(
                f"Branch topology did not resolve into {radial_sides}-vertex rings: "
                f"{[len(rings[index]) for index in sorted(rings)]}"
            )
        centers = [mean_point([vertices[index] for index in rings[distance]]) for distance in ordered_distances]
        radii = [
            sum((vertices[index] - centers[ring_index]).length for index in rings[distance]) / len(rings[distance])
            for ring_index, distance in enumerate(ordered_distances)
        ]
        paths.append(
            {
                "centers": centers,
                "radii": radii,
                "radialSides": radial_sides,
                "tipCap": capped_tip_distance is not None,
                # Internal topology ownership used by the stage validator; serializers below intentionally omit it.
                "vertices": component,
            }
        )
    return paths


def distance_to_polyline(point: Vector, points: list[Vector]) -> tuple[float, float]:
    lengths = [(points[index + 1] - points[index]).length for index in range(len(points) - 1)]
    total = max(sum(lengths), 1e-9)
    traversed = 0.0
    best = (float("inf"), 0.0)
    for index, segment_length in enumerate(lengths):
        start = points[index]
        delta = points[index + 1] - start
        local = max(0.0, min(1.0, (point - start).dot(delta) / max(delta.length_squared, 1e-9)))
        closest = start + delta * local
        candidate = ((point - closest).length, (traversed + segment_length * local) / total)
        if candidate[0] < best[0]:
            best = candidate
        traversed += segment_length
    return best


def infer_branch_hierarchy(paths: list[dict[str, object]]) -> None:
    """Build the source support graph by minimum root-to-retained-stem distance."""
    paths.sort(
        key=lambda path: (
            -polyline_length(path["centers"]),
            -path["radialSides"],
            min(point.z for point in path["centers"]),
            math.atan2(path["centers"][0].y, path["centers"][0].x),
        )
    )
    trunk = paths[0]
    if trunk["centers"][0].z > trunk["centers"][-1].z:
        trunk["centers"].reverse()
        trunk["radii"].reverse()
    trunk["level"] = 0
    trunk["support"] = None
    trunk["attachmentProgress"] = 0.0
    retained = {0}
    while len(retained) < len(paths):
        best = None
        for candidate_index, candidate in enumerate(paths):
            if candidate_index in retained:
                continue
            for support_index in retained:
                support = paths[support_index]
                first_distance, first_progress = distance_to_polyline(candidate["centers"][0], support["centers"])
                last_distance, last_progress = distance_to_polyline(candidate["centers"][-1], support["centers"])
                distance, progress, reverse = (
                    (last_distance, last_progress, True)
                    if last_distance < first_distance
                    else (first_distance, first_progress, False)
                )
                proposal = (distance, candidate_index, support_index, progress, reverse)
                if best is None or proposal < best:
                    best = proposal
        if best is None:
            raise RuntimeError("Could not connect the source branch hierarchy")
        distance, candidate_index, support_index, progress, reverse = best
        candidate = paths[candidate_index]
        if reverse:
            candidate["centers"].reverse()
            candidate["radii"].reverse()
        candidate["level"] = min(int(paths[support_index]["level"]) + 1, 2)
        candidate["support"] = support_index
        candidate["attachmentProgress"] = progress
        candidate["supportDistance"] = distance
        retained.add(candidate_index)
    levels = Counter(path["level"] for path in paths)
    if max(levels) > 2 or levels[0] != 1:
        raise RuntimeError(f"Unexpected inferred tree hierarchy {dict(levels)}")


def uv_by_vertex(obj: bpy.types.Object, faces: list[bpy.types.MeshPolygon], component: set[int]) -> dict[int, Vector]:
    result: dict[int, Vector] = {}
    if obj.data.uv_layers.active is None:
        raise RuntimeError(f"{obj.name} leaf geometry requires one active UV layer")
    uv_data = obj.data.uv_layers.active.data
    for polygon in faces:
        if polygon.vertices[0] not in component:
            continue
        for loop_index, vertex_index in zip(polygon.loop_indices, polygon.vertices):
            result.setdefault(vertex_index, uv_data[loop_index].uv.copy())
    return result


def extract_leaves(
    obj: bpy.types.Object,
    faces: list[bpy.types.MeshPolygon],
    branch_paths: list[dict[str, object]],
    origin: Vector,
) -> list[dict[str, object]]:
    world = obj.matrix_world
    vertices = [world @ vertex.co for vertex in obj.data.vertices]
    leaves = []
    for component in leaf_card_components(obj, faces):
        uvs = uv_by_vertex(obj, faces, component)
        ordered = sorted(component, key=lambda vertex: (round(float(uvs[vertex].y), 5), round(float(uvs[vertex].x), 5)))
        bottom = ordered[:2]
        top = ordered[2:]
        bottom.sort(key=lambda vertex: uvs[vertex].x)
        top.sort(key=lambda vertex: uvs[vertex].x)
        bottom_left, bottom_right = bottom
        top_left, top_right = top
        pivot = (vertices[bottom_left] + vertices[bottom_right]) * 0.5
        center = sum((vertices[index] for index in component), Vector()) / 4
        right = ((vertices[bottom_right] - vertices[bottom_left]) + (vertices[top_right] - vertices[top_left])) * 0.5
        up = ((vertices[top_left] - vertices[bottom_left]) + (vertices[top_right] - vertices[bottom_right])) * 0.5
        nearest_distance, stem_index, progress = min(
            (distance_to_polyline(center, path["centers"])[0], index, distance_to_polyline(center, path["centers"])[1])
            for index, path in enumerate(branch_paths)
        )
        leaves.append(
            {
                "pivot": engine_point(pivot, origin),
                "right": rounded((right.x, right.z, -right.y)),
                "up": rounded((up.x, up.z, -up.y)),
                "stem": stem_index,
                "progress": round(progress, 7),
                "nearestStemDistance": round(nearest_distance, 7),
            }
        )
    return leaves


def summarize_blueprint(
    height: float,
    branches: list[dict[str, object]],
    leaves: list[dict[str, object]],
) -> dict[str, object]:
    def magnitude(value: list[float]) -> float:
        return math.sqrt(sum(component * component for component in value))

    def subtract_values(left: list[float], right: list[float]) -> list[float]:
        return [left[axis] - right[axis] for axis in range(3)]

    def branch_level(level: int) -> dict[str, object]:
        selected = [branch for branch in branches if branch["level"] == level]
        path_lengths = [
            sum(
                magnitude(subtract_values(points[index + 1], points[index]))
                for index in range(len(points) - 1)
            )
            for points in (branch["points"] for branch in selected)
        ]
        endpoint_lengths = [
            magnitude(subtract_values(branch["points"][-1], branch["points"][0])) for branch in selected
        ]
        up_angles = [
            math.degrees(
                math.acos(
                    max(
                        -1.0,
                        min(
                            1.0,
                            subtract_values(branch["points"][-1], branch["points"][0])[1]
                            / max(endpoint_length, 1e-9),
                        ),
                    )
                )
            )
            for branch, endpoint_length in zip(selected, endpoint_lengths)
        ]
        return {
            "count": len(selected),
            "rootHeightRatioQuantiles": quantiles([branch["points"][0][1] / height for branch in selected]),
            "pathLengthRatioQuantiles": quantiles([value / height for value in path_lengths]),
            "endpointLengthRatioQuantiles": quantiles([value / height for value in endpoint_lengths]),
            "curveToChordRatioQuantiles": quantiles(
                [path / max(chord, 1e-9) for path, chord in zip(path_lengths, endpoint_lengths)]
            ),
            "upAngleDegreesQuantiles": quantiles(up_angles),
            "rootRadiusRatioQuantiles": quantiles([branch["radii"][0] / height for branch in selected]),
            "attachmentProgressQuantiles": quantiles([branch["attachmentProgress"] for branch in selected]),
        }

    trunk = next(branch for branch in branches if branch["level"] == 0)
    trunk_path_length = sum(
        magnitude(subtract_values(trunk["points"][index + 1], trunk["points"][index]))
        for index in range(len(trunk["points"]) - 1)
    )
    card_widths = [magnitude(leaf["right"]) for leaf in leaves]
    card_heights = [magnitude(leaf["up"]) for leaf in leaves]
    centers = [
        [leaf["pivot"][axis] + leaf["up"][axis] * 0.5 for axis in range(3)] for leaf in leaves
    ]
    normal_absolute_up = []
    for leaf in leaves:
        right = Vector(leaf["right"])
        up = Vector(leaf["up"])
        normal_absolute_up.append(abs(right.cross(up).normalized().y))
    per_stem = Counter(leaf["stem"] for leaf in leaves)
    nearest_chord_distances = []
    nearest_chord_progresses = []
    leaves_per_nearest_chord = [0 for _ in branches]
    for center_values in centers:
        center = Vector(center_values)
        nearest = (math.inf, 0, 0.0)
        for branch_index, branch in enumerate(branches):
            root = Vector(branch["points"][0])
            tip = Vector(branch["points"][-1])
            direction = tip - root
            length_squared = max(direction.length_squared, 1e-9)
            progress = min(1.0, max(0.0, (center - root).dot(direction) / length_squared))
            closest = root + direction * progress
            candidate = ((center - closest).length, branch_index, progress)
            if candidate[0] < nearest[0]:
                nearest = candidate
        nearest_chord_distances.append(nearest[0] / height)
        nearest_chord_progresses.append(nearest[2])
        leaves_per_nearest_chord[nearest[1]] += 1
    return {
        "trunk": {
            "count": 1,
            "height": round(height, 7),
            "pathLength": round(trunk_path_length, 7),
            "curveToHeightRatio": round(trunk_path_length / height, 7),
            "baseRadius": round(trunk["radii"][0], 7),
            "tipRadius": round(trunk["radii"][-1], 7),
            "radiusQuantiles": quantiles(trunk["radii"]),
            "centerlineSamples": len(trunk["points"]),
        },
        "primaryBranches": branch_level(1),
        "secondaryBranches": branch_level(2),
        "leaves": {
            "cards": len(leaves),
            "cardWidthQuantiles": quantiles(card_widths),
            "cardHeightQuantiles": quantiles(card_heights),
            "cardAreaQuantiles": quantiles(
                [width * card_height for width, card_height in zip(card_widths, card_heights)]
            ),
            "centerHeightRatioQuantiles": quantiles([center[1] / height for center in centers]),
            "centerRadiusRatioQuantiles": quantiles(
                [math.hypot(center[0], center[2]) / height for center in centers]
            ),
            "normalAbsoluteUpQuantiles": quantiles(normal_absolute_up),
            "lowestCenterHeightRatio": round(min((center[1] / height for center in centers), default=0.0), 7),
            "nearestStemDistanceRatioQuantiles": quantiles(nearest_chord_distances),
            "branchProgressQuantiles": quantiles(nearest_chord_progresses),
            "terminalLeafRatio": round(
                sum(progress >= 0.75 for progress in nearest_chord_progresses) / max(len(leaves), 1), 7
            ),
            "leafBearingStemRatio": round(
                sum(count > 0 for count in leaves_per_nearest_chord) / len(branches), 7
            ),
            "leavesPerStemQuantiles": quantiles(leaves_per_nearest_chord),
            "authoredLeafBearingStemRatio": round(len(per_stem) / len(branches), 7),
        },
    }


def find_lod_object(index: int) -> bpy.types.Object | None:
    expected = f"lod{index}"
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    exact = next((obj for obj in meshes if obj.name.lower() == expected), None)
    if exact is not None:
        return exact
    return next((obj for obj in meshes if expected in obj.name.lower()), None)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract a procedural tree blueprint from one Unity FBX")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--asset-id", default="measured-white-birch")
    parser.add_argument("--foliage-width-scale", type=float, default=1.0)
    parser.add_argument("--foliage-height-scale", type=float, default=1.0)
    parser.add_argument("--foliage-additive-half-extent", type=float, default=0.0)
    script_arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(script_arguments)


def main() -> None:
    arguments = parse_arguments()
    source_fbx = arguments.input.resolve()
    output_path = arguments.output.resolve()
    if not source_fbx.is_file():
        raise FileNotFoundError(source_fbx)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=str(source_fbx), use_image_search=False)
    lod0 = find_lod_object(0)
    if lod0 is None:
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        lod0 = max(meshes, key=lambda obj: len(obj.data.polygons), default=None)
    if lod0 is None:
        raise RuntimeError("Input tree mesh did not contain LOD0 geometry")
    branch_material_index, leaf_material_index = material_role_indices(lod0)
    branch_faces = material_faces(lod0, branch_material_index)
    leaf_faces = material_faces(lod0, leaf_material_index) if leaf_material_index is not None else []
    paths = extract_unoriented_branch_paths(lod0, branch_faces)
    infer_branch_hierarchy(paths)
    lod0_levels = Counter(path["level"] for path in paths)
    all_lod_paths = [paths]
    lod_branch_counts = [[lod0_levels[level] for level in range(3)]]
    lod_leaf_counts = [leaf_card_count(lod0, leaf_faces)]
    for lod_name in ("LOD1", "LOD2"):
        lod = find_lod_object(int(lod_name[-1]))
        if lod is None:
            current_lod_paths = paths
            levels = lod0_levels
            lod_branch_counts.append([levels[level] for level in range(3)])
            lod_leaf_counts.append(lod_leaf_counts[0])
            all_lod_paths.append(current_lod_paths)
            continue
        branch_material_index, leaf_material_index = material_role_indices(lod)
        lod_faces = material_faces(lod, branch_material_index)
        lod_leaf_faces = material_faces(lod, leaf_material_index) if leaf_material_index is not None else []
        try:
            current_lod_paths = extract_unoriented_branch_paths(lod, lod_faces)
            infer_branch_hierarchy(current_lod_paths)
            levels = Counter(path["level"] for path in current_lod_paths)
        except RuntimeError:
            # Imported lower LODs may change radial side counts along one tube. They
            # are reference statistics only: reconstruction owns and validates its
            # newly generated LOD hierarchy after the accepted LOD0 recipe.
            current_lod_paths = paths
            levels = lod0_levels
        lod_branch_counts.append([levels[level] for level in range(3)])
        lod_leaf_counts.append(leaf_card_count(lod, lod_leaf_faces))
        all_lod_paths.append(current_lod_paths)
    world = lod0.matrix_world
    branch_vertex_indices = {vertex for polygon in branch_faces for vertex in polygon.vertices}
    branch_vertices = [world @ lod0.data.vertices[index].co for index in branch_vertex_indices]
    minimum_z = min(point.z for point in branch_vertices)
    maximum_z = max(point.z for point in branch_vertices)
    base_limit = minimum_z + (maximum_z - minimum_z) * 0.025
    base = mean_point([point for point in branch_vertices if point.z <= base_limit])
    origin = Vector((base.x, base.y, minimum_z))
    leaves = extract_leaves(lod0, leaf_faces, paths, origin)
    def serialize_paths(source_paths: list[dict[str, object]]) -> list[dict[str, object]]:
        return [
            {
                "id": index,
                "level": path["level"],
                "support": path["support"],
                "attachmentProgress": round(path["attachmentProgress"], 7),
                "points": [engine_point(point, origin) for point in path["centers"]],
                "radii": [round(float(radius), 7) for radius in path["radii"]],
                "radialSegments": int(path["radialSides"]),
                "tipCap": bool(path["tipCap"]),
            }
            for index, path in enumerate(source_paths)
        ]

    serialized_lod_paths = [serialize_paths(source_paths) for source_paths in all_lod_paths]
    branches = serialized_lod_paths[0]
    height = maximum_z - minimum_z
    blueprint = {
        "schema": "galacean/procedural-tree-measured-blueprint-v1",
        "assetId": arguments.asset_id,
        "source": str(source_fbx),
        "coordinateSystem": "right-handed, Y-up, meters; trunk base centered at XZ origin",
        "height": round(height, 7),
        "branchCounts": lod_branch_counts[0],
        "lodBranchCounts": lod_branch_counts,
        "lodLeafCounts": lod_leaf_counts,
        "lodBranches": serialized_lod_paths,
        "inferredRules": summarize_blueprint(height, branches, leaves),
        "calibrationFoliageTuning": {
            "widthScale": arguments.foliage_width_scale,
            "heightScale": arguments.foliage_height_scale,
            "additiveHalfExtent": arguments.foliage_additive_half_extent,
            "lodScales": [1.0, 1.0, 1.0],
        },
        "branches": branches,
        "leaves": leaves,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(blueprint, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(output_path),
                "height": blueprint["height"],
                "branches": len(branches),
                "leaves": len(leaves),
                "maximumSupportDistance": max(branch.get("supportDistance", 0) for branch in paths),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
