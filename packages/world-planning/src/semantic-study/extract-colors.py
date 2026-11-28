#!/usr/bin/env python3
"""Extract editable colour regions from a flat planning image without altering it.

Usage: python extract-colors.py INPUT OUTPUT_DIR WORLD_SIZE [options]

WORLD_SIZE is the longest image side in metres; image-down maps to positive Z.
Outputs regions.json and overlay.svg. The SVG references the original image.
Dependencies are Pillow and NumPy. No route centreline or topology is inferred.
"""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
import hashlib
import html
import json
import math
import os
from pathlib import Path
import time
from urllib.parse import quote

import numpy as np
from PIL import Image


PALETTE = {
    "mountain": {"hue": None, "saturation": [0.0, 0.34], "value": [0.12, 0.92], "stroke": "#374151"},
    "water": {"hue": [165.0, 245.0], "saturation": [0.35, 1.0], "value": [0.18, 1.0], "stroke": "#0066ff"},
    "terrace": {"hue": [255.0, 325.0], "saturation": [0.28, 1.0], "value": [0.18, 1.0], "stroke": "#a000d8"},
    "road": {"hue": [18.0, 65.0], "saturation": [0.40, 1.0], "value": [0.30, 1.0], "stroke": "#c46a00"},
    "spawn": {"hue": [340.0, 18.0], "saturation": [0.45, 1.0], "value": [0.25, 1.0], "stroke": "#ff2020"},
}
DIRECTIONS = ((1, 0), (0, 1), (-1, 0), (0, -1))


def _rgb_to_hsv(rgb):
    values = rgb.astype(np.float32) / 255.0
    maximum, minimum = values.max(axis=2), values.min(axis=2)
    delta = maximum - minimum
    saturation = np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum > 0)
    hue = np.zeros_like(delta)
    nonzero = delta > 1e-7
    red, green, blue = values[:, :, 0], values[:, :, 1], values[:, :, 2]
    for index, numerator, offset in ((0, green - blue, 0), (1, blue - red, 2), (2, red - green, 4)):
        selected = nonzero & (values.argmax(axis=2) == index)
        hue[selected] = (numerator[selected] / delta[selected] + offset) * 60.0
    return np.mod(hue, 360.0), saturation, maximum


def _classify(rgba, alpha_threshold):
    hue, saturation, value = _rgb_to_hsv(rgba[:, :, :3])
    visible = rgba[:, :, 3] >= alpha_threshold
    masks = {}
    for kind, rule in PALETTE.items():
        mask = visible & (saturation >= rule["saturation"][0]) & (saturation <= rule["saturation"][1])
        mask &= (value >= rule["value"][0]) & (value <= rule["value"][1])
        if rule["hue"] is not None:
            low, high = rule["hue"]
            mask &= ((hue >= low) & (hue <= high)) if low <= high else ((hue >= low) | (hue <= high))
        masks[kind] = mask
    return masks, visible


def _components(mask):
    height, width = mask.shape
    unseen = mask.copy()
    components = []
    for row in range(height):
        for column in np.flatnonzero(unseen[row]):
            column = int(column)
            if not unseen[row, column]:
                continue
            queue = deque([(row, column)])
            unseen[row, column] = False
            pixels = []
            touches_border = False
            while queue:
                y, x = queue.popleft()
                pixels.append((y, x))
                touches_border |= x == 0 or y == 0 or x == width - 1 or y == height - 1
                for dx, dy in DIRECTIONS:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height and unseen[ny, nx]:
                        unseen[ny, nx] = False
                        queue.append((ny, nx))
            components.append((pixels, touches_border))
    return components


def _morphology(mask, radius, dilation):
    height, width = mask.shape
    padded = np.pad(mask, radius, constant_values=False)
    output = np.zeros_like(mask) if dilation else np.ones_like(mask)
    for dy in range(radius * 2 + 1):
        for dx in range(radius * 2 + 1):
            shifted = padded[dy:dy + height, dx:dx + width]
            if dilation:
                output |= shifted
            else:
                output &= shifted
    return output


def _close_preserving_holes(mask, radius):
    holes = np.zeros_like(mask)
    hole_count = 0
    for pixels, touches_border in _components(~mask):
        if not touches_border:
            ys, xs = np.asarray(pixels).T
            holes[ys, xs] = True
            hole_count += 1
    if radius:
        closed = mask | _morphology(_morphology(mask, radius, True), radius, False)
        closed[holes] = False
    else:
        closed = mask.copy()
    return closed, {"inputHoleCount": hole_count, "preservedHoleCells": int(holes.sum()),
                    "addedCells": int((closed & ~mask).sum()), "removedCells": int((mask & ~closed).sum())}


def _boundary_rings(pixels):
    occupied = set(pixels)
    outgoing = defaultdict(set)
    for y, x in pixels:
        if (y - 1, x) not in occupied:
            outgoing[(x, y)].add(0)
        if (y, x + 1) not in occupied:
            outgoing[(x + 1, y)].add(1)
        if (y + 1, x) not in occupied:
            outgoing[(x + 1, y + 1)].add(2)
        if (y, x - 1) not in occupied:
            outgoing[(x, y + 1)].add(3)
    rings = []
    while outgoing:
        start = min(outgoing, key=lambda point: (point[1], point[0]))
        current = start
        direction = min(outgoing[start])
        ring = []
        while True:
            ring.append(current)
            outgoing[current].remove(direction)
            if not outgoing[current]:
                del outgoing[current]
            dx, dy = DIRECTIONS[direction]
            current = (current[0] + dx, current[1] + dy)
            if current == start:
                break
            choices = outgoing.get(current)
            if not choices:
                raise RuntimeError("Boundary tracing encountered an open raster edge")
            # Keep occupied cells on the right at diagonal-touch ambiguities.
            direction = next(turn for turn in ((direction + 1) % 4, direction, (direction - 1) % 4,
                                               (direction + 2) % 4) if turn in choices)
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def _signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) * 0.5


def _rdp(points, tolerance):
    coordinates = np.asarray(points, dtype=np.float64)
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        if last <= first + 1:
            continue
        a, b = coordinates[first], coordinates[last]
        delta = b - a
        length_squared = float(delta @ delta)
        interior = coordinates[first + 1:last]
        if length_squared:
            t = np.clip(((interior - a) @ delta) / length_squared, 0, 1)
            distances = np.linalg.norm(interior - a - t[:, None] * delta, axis=1)
        else:
            distances = np.linalg.norm(interior - a, axis=1)
        at = int(np.argmax(distances))
        if distances[at] > tolerance:
            index = first + 1 + at
            keep.add(index)
            pending.extend(((first, index), (index, last)))
    return [points[index] for index in sorted(keep)]


def _simplify_ring(ring, tolerance):
    if tolerance <= 0 or len(ring) <= 4:
        return ring
    a = np.asarray(ring[0])
    farthest = int(np.argmax(np.sum((np.asarray(ring) - a) ** 2, axis=1)))
    first = _rdp(ring[:farthest + 1], tolerance)
    second = _rdp(ring[farthest:] + ring[:1], tolerance)
    simplified = first[:-1] + second[:-1]
    if len(simplified) < 3 or _signed_area(simplified) * _signed_area(ring) <= 0:
        return ring
    return simplified


def _point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def _hole_probe(ring):
    a, b = ring[0], ring[1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    return ((a[0] + b[0]) * 0.5 - dy / length * 0.25,
            (a[1] + b[1]) * 0.5 + dx / length * 0.25)


def _segments_intersect(a, b, c, d):
    if max(a[0], b[0]) < min(c[0], d[0]) or max(c[0], d[0]) < min(a[0], b[0]):
        return False
    if max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1]):
        return False
    def cross(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return cross(a, b, c) * cross(a, b, d) <= 0 and cross(c, d, a) * cross(c, d, b) <= 0


def _self_intersects(ring):
    for i, (a, b) in enumerate(zip(ring, ring[1:] + ring[:1])):
        for j in range(i + 2, len(ring)):
            if i == 0 and j == len(ring) - 1:
                continue
            if _segments_intersect(a, b, ring[j], ring[(j + 1) % len(ring)]):
                return True
    return False


def _rings_intersect(first, second):
    return any(_segments_intersect(a, b, c, d)
               for a, b in zip(first, first[1:] + first[:1])
               for c, d in zip(second, second[1:] + second[:1]))


def _topology_safe_simplification(outer, holes, tolerance):
    simple_outer = _simplify_ring(outer, tolerance)
    simple_holes = [_simplify_ring(hole, tolerance) for hole in holes]
    valid = not _self_intersects(simple_outer) and not any(_self_intersects(hole) for hole in simple_holes)
    if valid:
        for i, hole in enumerate(simple_holes):
            if not _point_in_ring(_hole_probe(holes[i]), simple_outer) or _rings_intersect(simple_outer, hole):
                valid = False
                break
            if any(_rings_intersect(hole, other) for other in simple_holes[i + 1:]):
                valid = False
                break
    return (simple_outer, simple_holes, False) if valid else (outer, holes, True)


def _svg_path(rings, sx, sy):
    parts = []
    for ring in rings:
        parts.append("M" + " L".join(f"{x * sx:.3f},{y * sy:.3f}" for x, y in ring) + " Z")
    return " ".join(parts)


def _hole_contents(ring, raw_masks, grid_visible):
    min_x, max_x = int(min(point[0] for point in ring)), int(max(point[0] for point in ring))
    min_y, max_y = int(min(point[1] for point in ring)), int(max(point[1] for point in ring))
    counts = {kind: 0 for kind in raw_masks}
    transparent = unknown = cells = 0
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            if not _point_in_ring((x + 0.5, y + 0.5), ring):
                continue
            cells += 1
            transparent += int(not grid_visible[y, x])
            classified = False
            for kind, mask in raw_masks.items():
                if mask[y, x]:
                    counts[kind] += 1
                    classified = True
            unknown += int(grid_visible[y, x] and not classified)
    return {"cells": cells, "classCells": counts, "transparentCells": transparent, "unclassifiedOpaqueCells": unknown}


def extract(input_path: Path, output_dir: Path, world_size: float, *, max_grid_side=512,
            alpha_threshold=80, coverage_threshold=0.35, min_area_fraction=0.00008,
            close_radius=1, simplify_pixels=2.0):
    """Write editable regions and a source-linked overlay.

    Args:
        input_path: Read-only input planning image.
        output_dir: Directory receiving regions.json and overlay.svg.
        world_size: Longest world-space side in metres, preserving image aspect ratio.
        max_grid_side: Longest mask dimension; images are never upscaled.
        alpha_threshold: Source alpha lower bound in [0, 255].
        coverage_threshold: Minimum classified pixel coverage per working cell.
        min_area_fraction: Minimum retained component fraction of the source image.
        close_radius: Working-grid closing radius; existing mask holes are protected.
        simplify_pixels: RDP tolerance measured in original image pixels.

    Returns:
        The JSON-ready extraction with actual counts and measured approximation errors.
    """
    started = time.perf_counter()
    input_path = input_path.expanduser().resolve()
    source_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    with Image.open(input_path) as source:
        rgba_image = source.convert("RGBA")
    rgba = np.asarray(rgba_image)
    height, width = rgba.shape[:2]
    scale = min(1.0, max_grid_side / max(width, height))
    grid_width, grid_height = max(1, round(width * scale)), max(1, round(height * scale))
    sx, sy = width / grid_width, height / grid_height
    world_width, world_depth = world_size * width / max(width, height), world_size * height / max(width, height)
    raw_source_masks, visible = _classify(rgba, alpha_threshold)
    def resample(mask):
        coverage = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize(
            (grid_width, grid_height), Image.Resampling.BOX)) / 255.0
        return coverage >= coverage_threshold
    raw_masks = {kind: resample(mask) for kind, mask in raw_source_masks.items()}
    grid_visible = resample(visible)
    grid_rgba = np.asarray(rgba_image.resize((grid_width, grid_height), Image.Resampling.BOX))
    hue, saturation, value = _rgb_to_hsv(grid_rgba[:, :, :3])
    minimum_cells = max(2, math.ceil(min_area_fraction * grid_width * grid_height))
    tolerance = simplify_pixels / max(sx, sy)
    svg_shapes, regions, class_statistics = [], [], {}
    def pixel_ring(ring):
        return [[round(x * sx, 4), round(y * sy, 4)] for x, y in ring]
    def world_ring(ring):
        return [{"x": round((x / grid_width - 0.5) * world_width, 6),
                 "z": round((y / grid_height - 0.5) * world_depth, 6)} for x, y in ring]
    for kind, raw_mask in raw_masks.items():
        mask, morphology = _close_preserving_holes(raw_mask, close_radius)
        components = sorted(_components(mask), key=lambda component: (-len(component[0]), component[0][0]))
        retained = 0
        dropped_cells = dropped_components = 0
        for pixels, touches_border in components:
            if len(pixels) < minimum_cells:
                dropped_components += 1
                dropped_cells += len(pixels)
                continue
            retained += 1
            region_id = f"{kind}-{retained:03d}"
            rings = _boundary_rings(pixels)
            outers = sorted((ring for ring in rings if _signed_area(ring) > 0), key=lambda ring: -_signed_area(ring))
            holes = [ring for ring in rings if _signed_area(ring) < 0]
            assigned = [[] for _ in outers]
            for hole in holes:
                containing = [i for i, outer in enumerate(outers) if _point_in_ring(_hole_probe(hole), outer)]
                if not containing:
                    raise RuntimeError(f"{region_id}: a hole has no containing exterior; refusing to discard it")
                assigned[min(containing, key=lambda i: abs(_signed_area(outers[i])))].append(hole)
            polygons, vector_area, raw_vertices, vector_vertices, fallback_count = [], 0.0, 0, 0, 0
            for outer, polygon_holes in zip(outers, assigned):
                simplified, simplified_holes, fallback = _topology_safe_simplification(outer, polygon_holes, tolerance)
                fallback_count += int(fallback)
                raw_vertices += len(outer) + sum(map(len, polygon_holes))
                vector_vertices += len(simplified) + sum(map(len, simplified_holes))
                vector_area += (_signed_area(simplified) + sum(map(_signed_area, simplified_holes))) * sx * sy
                polygons.append({
                    "pixelOutline": pixel_ring(simplified), "worldOutline": world_ring(simplified),
                    "holes": [{"pixelOutline": pixel_ring(simple_hole), "worldOutline": world_ring(simple_hole),
                               "maskAreaPixelsApprox": round(abs(_signed_area(raw_hole)) * sx * sy, 4),
                               "contents": _hole_contents(raw_hole, raw_masks, grid_visible)}
                              for raw_hole, simple_hole in zip(polygon_holes, simplified_holes)],
                    "simplificationRevertedForTopology": fallback,
                })
                path = _svg_path([simplified] + simplified_holes, sx, sy)
                svg_shapes.append(f'<path d="{path}" fill="{PALETTE[kind]["stroke"]}" fill-opacity="0.10" '
                                  f'stroke="{PALETTE[kind]["stroke"]}" stroke-width="2" fill-rule="evenodd">'
                                  f'<title>{html.escape(region_id)}; {len(polygon_holes)} holes</title></path>')
            coordinates = np.asarray(pixels)
            ys, xs = coordinates[:, 0], coordinates[:, 1]
            center_x, center_y = float(np.mean(xs + 0.5)), float(np.mean(ys + 0.5))
            measured = raw_mask[ys, xs]
            sampled_y, sampled_x = ys[measured], xs[measured]
            component_area = len(pixels) * sx * sy
            color_statistics = None
            if len(sampled_x):
                color_statistics = {
                    "sampleSpace": "working-grid source-colour cells; excludes closing-only additions",
                    "meanRGB": [round(float(channel), 2) for channel in grid_rgba[sampled_y, sampled_x, :3].mean(axis=0)],
                    "valueQuantiles": [round(float(q), 5) for q in np.quantile(value[sampled_y, sampled_x], [0.1, 0.5, 0.9])],
                    "saturationQuantiles": [round(float(q), 5) for q in np.quantile(saturation[sampled_y, sampled_x], [0.1, 0.5, 0.9])],
                }
            regions.append({
                "id": region_id, "kind": kind, "touchesImageBoundary": bool(touches_border),
                "centroid": {"pixel": [round(center_x * sx, 4), round(center_y * sy, 4)],
                             "world": {"x": round((center_x / grid_width - 0.5) * world_width, 6),
                                       "z": round((center_y / grid_height - 0.5) * world_depth, 6)}},
                "boundsPixels": {"minX": round(float(xs.min()) * sx, 4), "maxX": round(float(xs.max() + 1) * sx, 4),
                                 "minY": round(float(ys.min()) * sy, 4), "maxY": round(float(ys.max() + 1) * sy, 4)},
                "area": {"workingCells": len(pixels), "maskPixelsApprox": round(component_area, 4),
                         "worldSquareMetres": round(len(pixels) * world_width * world_depth / (grid_width * grid_height), 6),
                         "vectorPixels": round(vector_area, 4),
                         "vectorRelativeError": round(abs(vector_area - component_area) / component_area, 6)},
                "holeCount": len(holes), "polygons": polygons,
                "colorStatistics": color_statistics,
                "vertices": {"raw": raw_vertices, "simplified": vector_vertices, "topologyFallbacks": fallback_count},
                "requiresSemanticAnnotation": (["centreline", "route endpoints", "connection topology"] if kind == "road"
                    else ["height and profile", "hole meaning: visible void or differently coloured overlay"] if kind in ("mountain", "terrace")
                    else ["water level", "river/lake identity", "connection topology"] if kind == "water" else ["spawn facing direction"]),
            })
            svg_shapes.append(f'<text x="{center_x * sx:.2f}" y="{center_y * sy:.2f}" font-size="14" '
                              f'font-family="sans-serif" fill="{PALETTE[kind]["stroke"]}" paint-order="stroke" '
                              f'stroke="white" stroke-width="3">{region_id}</text>')
        class_statistics[kind] = {"sourceClassifiedPixels": int(raw_source_masks[kind].sum()),
                                  "rawWorkingCells": int(raw_mask.sum()), "processedWorkingCells": int(mask.sum()),
                                  "componentCount": len(components), "retainedRegions": retained,
                                  "excludedSmallComponents": dropped_components, "excludedSmallCells": dropped_cells,
                                  "morphology": morphology}
    classified = np.logical_or.reduce(list(raw_source_masks.values()))
    result = {
        "schema": "semantic-color-regions/1",
        "source": {"path": str(input_path), "sha256": source_hash, "width": width, "height": height,
                   "opaqueEnoughPixels": int(visible.sum()), "excludedTransparentPixels": int((~visible).sum()),
                   "unclassifiedVisiblePixels": int((visible & ~classified).sum())},
        "world": {"longestSideMetres": world_size, "widthMetres": world_width, "depthMetres": world_depth,
                  "origin": "image centre", "xDirection": "image right", "zDirection": "image down"},
        "algorithm": {"classification": "source RGBA alpha gate and HSV ranges", "palette": PALETTE,
                      "alphaThreshold": alpha_threshold, "gridWidth": grid_width, "gridHeight": grid_height,
                      "originalPixelsPerCell": [sx, sy], "coverageThreshold": coverage_threshold,
                      "connectivity": 4, "closingRadiusCells": close_radius, "protectExistingGridHoles": True,
                      "minimumComponentAreaFraction": min_area_fraction, "minimumComponentCells": minimum_cells,
                      "simplification": "closed-ring RDP with ring crossing and hole-containment fallback",
                      "simplificationToleranceOriginalPixels": simplify_pixels,
                      "regionsMayOverlapAfterClosing": True},
        "limitations": [
            "HSV labels are colour conventions, not automatic recognition of functional or traversable space.",
            "Every hole found at working resolution is retained. Features smaller than a working cell can be lost in downsampling.",
            "A hole may contain another colour layer rather than empty space; contents are reported and never silently filled.",
            "Closing may join nearby fragments and add boundary cells; actual additions and discarded small regions are reported.",
            "Road contours do not provide centrelines, junctions, bridges, or a route graph; these require semantic annotation.",
            "Mountain shade quantiles describe source colours, not calibrated elevations; heights need authored meaning.",
            "The overlay references the original PNG through a relative image href; retain their directory relationship.",
        ],
        "statistics": {"regions": len(regions), "holes": sum(region["holeCount"] for region in regions),
                       "elapsedSeconds": round(time.perf_counter() - started, 4), "classes": class_statistics},
        "regions": regions,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "regions.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    image_href = quote(Path(os.path.relpath(input_path, output_dir.resolve())).as_posix())
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
           '<rect width="100%" height="100%" fill="#f4f4f4"/>'
           f'<image href="{html.escape(image_href, quote=True)}" width="{width}" height="{height}"/>'
           + "".join(svg_shapes) + "</svg>\n")
    (output_dir / "overlay.svg").write_text(svg, encoding="utf-8")
    if hashlib.sha256(input_path.read_bytes()).hexdigest() != source_hash:
        raise RuntimeError("Input changed during extraction")
    return result


def main():
    """Parse the standalone CLI, validate extraction limits, and print actual output statistics."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("world_size", type=float)
    parser.add_argument("--max-grid-side", type=int, default=512)
    parser.add_argument("--alpha-threshold", type=int, default=80)
    parser.add_argument("--coverage-threshold", type=float, default=0.35)
    parser.add_argument("--min-area-fraction", type=float, default=0.00008)
    parser.add_argument("--close-radius", type=int, default=1)
    parser.add_argument("--simplify-pixels", type=float, default=2.0)
    args = parser.parse_args()
    if not math.isfinite(args.world_size) or args.world_size <= 0:
        parser.error("world_size must be a finite positive number")
    if not 16 <= args.max_grid_side <= 2048 or not 0 <= args.alpha_threshold <= 255:
        parser.error("max-grid-side must be 16..2048 and alpha-threshold must be 0..255")
    if not 0 < args.coverage_threshold <= 1 or not 0 <= args.min_area_fraction < 1:
        parser.error("coverage-threshold must be (0,1] and min-area-fraction must be [0,1)")
    if not 0 <= args.close_radius <= 4 or not math.isfinite(args.simplify_pixels) or args.simplify_pixels < 0:
        parser.error("close-radius must be 0..4 and simplify-pixels must be finite and non-negative")
    result = extract(args.input, args.output_dir, args.world_size,
                     max_grid_side=args.max_grid_side, alpha_threshold=args.alpha_threshold,
                     coverage_threshold=args.coverage_threshold, min_area_fraction=args.min_area_fraction,
                     close_radius=args.close_radius, simplify_pixels=args.simplify_pixels)
    print(json.dumps({"outputDirectory": str(args.output_dir.resolve()), "statistics": result["statistics"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
