"""Generate the Low Poly source GLBs and the bundled meadow texture."""

import argparse
import json
import math
import random
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

class Model:
    def __init__(self):
        self.parts = {}

    def face(self, color, vertices):
        a, b, c = vertices[:3]
        u, v = ([p[i] - a[i] for i in range(3)] for p in (b, c))
        normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        length = math.hypot(*normal)
        positions, normals = self.parts.setdefault(color, ([], []))
        for i in range(1, len(vertices) - 1):
            positions.extend((a, vertices[i], vertices[i + 1]))
            normals.extend([tuple(n / length for n in normal)] * 3)

    def solid(self, color, vertices, faces):
        center = tuple(sum(p[i] for p in vertices) / len(vertices) for i in range(3))
        for face in faces:
            points = [vertices[i] for i in face]
            a, b, c = points[:3]
            u, v, w = ([p[i] - a[i] for i in range(3)] for p in (b, c, center))
            cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            if sum(x * y for x, y in zip(cross, w)) > 0:
                points.reverse()
            self.face(color, points)

    def box(self, color, center, size, roll=0, pitch=0):
        def vertex(x, y, z):
            y, z = y * math.cos(pitch) - z * math.sin(pitch), y * math.sin(pitch) + z * math.cos(pitch)
            x, y = x * math.cos(roll) - y * math.sin(roll), x * math.sin(roll) + y * math.cos(roll)
            return tuple(a + b for a, b in zip(center, (x, y, z)))

        w, h, d = (extent / 2 for extent in size)
        self.solid(
            color,
            [vertex(x, y, z) for z in (-d, d) for x, y in ((-w, -h), (w, -h), (w, h), (-w, h))],
            [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
        )

    def frustum(self, color, origin, tip, base_radius, top_radius, sides):
        direction = tuple(b - a for a, b in zip(origin, tip))
        length = math.hypot(*direction)
        up = tuple(v / length for v in direction)
        lateral = (up[1], -up[0], 0)
        lateral = tuple(v / math.hypot(*lateral) for v in lateral)
        forward = (
            up[1] * lateral[2] - up[2] * lateral[1],
            up[2] * lateral[0] - up[0] * lateral[2],
            up[0] * lateral[1] - up[1] * lateral[0],
        )
        rings = [
            tuple(p + radius * (x * math.cos(a) + y * math.sin(a)) for p, x, y in zip(center, lateral, forward))
            for center, radius in ((origin, base_radius), (tip, top_radius))
            for a in (i * math.tau / sides for i in range(sides))
        ]
        self.solid(color, rings, [
            tuple(range(sides)), tuple(range(sides, sides * 2)),
            *((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides)),
        ])

    def crown(self, color, center, size, rng):
        phi = (1 + math.sqrt(5)) / 2
        vertices = [
            (-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0),
            (0, -1, phi), (0, 1, phi), (0, -1, -phi), (0, 1, -phi),
            (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1),
        ]
        faces = [
            (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
            (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
            (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
            (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
        ]
        points = [
            tuple(c + d * r * rng.uniform(0.91, 1.09) / phi for c, d, r in zip(center, vertex, size))
            for vertex in vertices
        ]
        for face in faces:
            self.solid(color, points, [face])

    def write(self, name):
        binary = bytearray()
        document = dict(asset={"version": "2.0", "generator": "Seed World Low Poly"}, scene=0,
                        scenes=[{"nodes": [0]}], nodes=[{"name": name, "mesh": 0}],
                        buffers=[], bufferViews=[], accessors=[], materials=[], meshes=[{"primitives": []}])

        def accessor(values, bounds=False):
            view = len(document["bufferViews"])
            data = struct.pack(f"<{len(values) * 3}f", *(x for vertex in values for x in vertex))
            document["bufferViews"].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(data), target=34962))
            binary.extend(data)
            result = dict(bufferView=view, componentType=5126, count=len(values), type="VEC3")
            if bounds:
                result.update(min=list(map(min, zip(*values))), max=list(map(max, zip(*values))))
            document["accessors"].append(result)
            return len(document["accessors"]) - 1

        def index_accessor(values):
            view = len(document["bufferViews"])
            use_u32 = max(values) > 65535
            fmt, ctype = ("I", 5125) if use_u32 else ("H", 5123)
            data = struct.pack(f"<{len(values)}{fmt}", *values)
            document["bufferViews"].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(data), target=34963))
            binary.extend(data)
            binary.extend(b"\0" * (-len(binary) % 4))
            document["accessors"].append(dict(bufferView=view, componentType=ctype, count=len(values), type="SCALAR"))
            return len(document["accessors"]) - 1

        positions, normals, colors, indices = [], [], [], []
        vertex_lookup = {}
        for color, (part_positions, part_normals) in self.parts.items():
            rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
            for pos, nrm in zip(part_positions, part_normals):
                key = struct.pack("<9f", *pos, *nrm, *linear)
                idx = vertex_lookup.get(key)
                if idx is None:
                    idx = len(positions)
                    vertex_lookup[key] = idx
                    positions.append(pos)
                    normals.append(nrm)
                    colors.append(linear)
                indices.append(idx)
        document["materials"].append(dict(name="Low Poly vertex colors", pbrMetallicRoughness=dict(
            metallicFactor=0, roughnessFactor=0.82)))
        document["meshes"][0]["primitives"].append(dict(
            attributes=dict(POSITION=accessor(positions, True), NORMAL=accessor(normals), COLOR_0=accessor(colors)),
            indices=index_accessor(indices),
            material=0))
        document["buffers"] = [{"byteLength": len(binary)}]
        metadata = json.dumps(document, separators=(",", ":")).encode()
        metadata += b" " * (-len(metadata) % 4)
        header = struct.pack("<4sII", b"glTF", 2, len(metadata) + len(binary) + 28)
        (OUTPUT / f"{name}.glb").write_bytes(
            header + struct.pack("<I4s", len(metadata), b"JSON") + metadata
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary
        )


def house(barn=False):
    mesh = Model()
    wood = "452b17"
    walls = "dfc089" if barn else "e3c48e"
    stone = "b5ad9e"
    # Stepped stone foundation plinth
    mesh.box("aba394", (0, 0.34, 0), (8.48, 0.68, 6.68))
    mesh.box(walls, (0, 2.4, 0), (8, 3.6, 6.2))
    mesh.solid(walls, [(-4, 4.2, -3.1), (4, 4.2, -3.1), (0, 7.12, -3.1),
                      (-4, 4.2, 3.1), (4, 4.2, 3.1), (0, 7.12, 3.1)],
               [(0, 1, 2), (3, 4, 5), (0, 1, 4, 3), (0, 2, 5, 3), (1, 2, 5, 4)])
    roof_angle = math.atan2(2.92, 4)
    tile_palette = ("dc6824", "eb7f33", "f69846", "cf5d1f")
    for side in (-1, 1):
        mesh.box(wood, (side * 2.22, 5.62, 0), (5.68, 0.24, 7.38), roll=-side * roof_angle)
        for row in range(7):
            x = side * (row + 0.52) * 0.65
            for column in range(8):
                z = (column - 3.5) * 0.91
                mesh.box(tile_palette[(row + column * 2) % 4],
                         (x, 7.57 - abs(x) * 2.92 / 4, z), (0.84, 0.16, 0.91), roll=-side * roof_angle)
        # Fascia trim along roof eaves
        mesh.box("e5782e", (side * 4.42, 4.34, 0), (0.16, 0.28, 7.42), roll=-side * roof_angle)
        # Timber wall beams (horizontal tie beam + vertical posts)
        mesh.box(wood, (side * 4.01, 4.02, 0), (0.26, 0.28, 6.46))
        for z in (-3.02, 0, 3.02):
            mesh.box(wood, (side * 4.01, 2.44, z), (0.28, 3.5, 0.28))
            mesh.box(wood, (side * z * 1.26, 2.44, -3.12), (0.28, 3.5, 0.26))
            mesh.box(wood, (side * z * 1.26, 2.44, 3.12), (0.28, 3.5, 0.26))
        for z_end in (-3.17, 3.17):
            mesh.box(wood, (side * 1.86, 5.48, z_end), (3.96, 0.22, 0.2), roll=-side * roof_angle)
    # Terracotta ridge cap
    mesh.box("d86422", (0, 7.6, 0), (0.4, 0.2, 7.42))
    for z_end in (-3.18, 3.18):
        mesh.box(wood, (0, 4.16, z_end), (8.28, 0.28, 0.22))
        mesh.box(wood, (0, 5.48, z_end), (0.26, 2.62, 0.22))
    # Front wooden door + frame
    door_w = 3.35 if barn else 1.38
    mesh.box(wood, (0, 1.82, -3.18), (door_w + 0.34, 2.68, 0.2))
    mesh.box("633e22", (0, 1.78, -3.23), (door_w, 2.52, 0.16))
    # Mullioned windows on front gable and side walls
    for x in (-2.47, 2.47):
        mesh.box(wood, (x, 2.48, -3.22), (1.36, 1.48, 0.24))
        mesh.box("edb858", (x, 2.51, -3.35), (0.98, 1.12, 0.04))
        mesh.box(wood, (x, 2.51, -3.39), (0.12, 1.12, 0.09))
        mesh.box(wood, (x, 2.51, -3.39), (0.98, 0.12, 0.09))
        mesh.box("59381f", (x, 1.78, -3.34), (1.5, 0.18, 0.38))
    for step in range(3):
        mesh.box(stone, (0, 0.1 + step * 0.09, -3.72 + step * 0.17), (2.06, 0.2 + step * 0.18, 0.62))
    if not barn:
        # Prominent warm-grey stone chimney on the road-facing (-X) roof slope
        mesh.box("9f9b93", (-1.55, 7.12, -0.35), (0.92, 2.55, 0.86))
        mesh.box("bdb8ae", (-1.55, 8.42, -0.35), (1.14, 0.28, 1.06))
        mesh.box("5c5852", (-1.55, 8.58, -0.35), (0.66, 0.08, 0.6))
    mesh.write("barn" if barn else "cottage")


def arch(side):
    mesh = Model()
    stone = ("dfc18d", "d5b57f", "e6ca98", "ccb07a")
    mortar = "a38a5e"
    # Underground skirt + stepped stone pier plinth + 3 ashlar courses (fits [8, 6, 1.7] at exact 1:1 scale)
    mesh.box("d4b580", (0, -0.04, 0), (1.76, 0.62, 1.68))
    for row in range(3):
        y_c = 0.48 + row * 0.48
        w_c = 1.62 - row * 0.045
        d_c = 1.62 - row * 0.05
        mesh.box(stone[row], (0, y_c, 0), (w_c, 0.43, d_c))
        if row < 2:
            mesh.box(mortar, (0, y_c + 0.24, 0), (w_c * 0.94, 0.05, d_c * 0.94))
    # Impost cap molding before the arch springline
    mesh.box("ead0a0", (0, 1.66, 0), (1.66, 0.14, 1.66))
    # Leave the walking lane between the independently reserved piers; max_y = 1.62 + 4.38 = 6.00.
    segments = 6
    for i in range(segments):
        start = i * math.pi / (2 * segments) + 0.008
        end = (i + 1) * math.pi / (2 * segments) - (0.0005 if i == segments - 1 else 0.008)
        r_in = 2.68 if i == segments - 1 else 2.74
        r_out = 4.38 if i == segments - 1 else 4.3
        z_half = 0.76 if i == segments - 1 else 0.72
        xy = [(side * (r * math.cos(a) - 3.5), 1.62 + r * math.sin(a))
              for r, a in ((r_in, start), (r_out, start), (r_out, end), (r_in, end))]
        mesh.solid(stone[(i + (1 if side > 0 else 2)) % 4],
                   [(x, y, z) for z in (-z_half, z_half) for x, y in xy],
                   [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
        if i < segments - 1:
            jm_s, jm_e = end, end + 0.016
            jxy = [(side * (r * math.cos(a) - 3.5), 1.62 + r * math.sin(a))
                   for r, a in ((2.78, jm_s), (4.24, jm_s), (4.24, jm_e), (2.78, jm_e))]
            mesh.solid(mortar,
                       [(x, y, z) for z in (-0.67, 0.67) for x, y in jxy],
                       [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
    mesh.write("arch-west" if side > 0 else "arch-east")


def trees():
    mesh = Model()
    mesh.frustum("593a1f", (0, 0, 0), (0.25, 7.4, 0), 1.15, 0.4, 7)
    rng = random.Random(211)
    for x, y, z, radius, color in (
        (-3.3, 8.3, -0.2, 3.85, "5da31e"),
        (3.15, 8.8, 0.15, 4.15, "7bc028"),
        (-0.15, 10.4, -1.7, 3.75, "8ecf32"),
        (0.35, 9.1, 2.35, 3.85, "6ab223"),
        (0.0, 10.9, 0.25, 3.45, "86c92e"),
    ):
        mesh.frustum("54361c", (0, 3.7, 0), (x, y, z), 0.54, 0.15, 6)
        mesh.crown(color, (x, y, z), (radius, radius * 0.85, radius), rng)
    mesh.write("oak")

    mesh = Model()
    mesh.frustum("593a20", (0, 0, 0), (0, 8.1, 0), 0.42, 0.1, 6)
    for i, color in enumerate(("2c6e32", "3a8237", "4b983d", "5eae45")):
        mesh.frustum(color, (0, 1.45 + i * 1.62, 0), (0, 5.95 + i * 1.35, 0), 2.82 - i * 0.56, 0.03, 8)
    mesh.write("pine")


def crop_bed(wheat):
    mesh = Model()
    rng = random.Random(141)
    mesh.box("7a5336", (0, 0.16, 0), (5.5, 0.45, 8.5))
    # Full 4-sided rustic wooden post-and-rail fence
    for x in (-2.68, 0, 2.68):
        for z in (-4.12, 4.12):
            mesh.box("5e3b1f", (x, 0.64, z), (0.2, 1.32, 0.2))
    for x in (-2.68, 2.68):
        mesh.box("5e3b1f", (x, 0.64, 0), (0.2, 1.32, 0.2))
        for y in (0.52, 0.92):
            mesh.box("734928", (x, y, 0), (0.12, 0.14, 8.36))
    for z in (-4.12, 4.12):
        for y in (0.52, 0.92):
            mesh.box("734928", (0, y, z), (5.48, 0.14, 0.12))
    for row in range(6 if wheat else 4):
        x = (row - 2.5) * 0.79 if wheat else (row - 1.5) * 1.16
        mesh.box("8f6541", (x, 0.36, 0), (0.57, 0.23, 7.6))
        for column in range(20 if wheat else 9):
            z = (column - 9.5) * 0.37 if wheat else (column - 4) * 0.8
            if wheat:
                xj, zj = x + rng.uniform(-0.24, 0.24), z + rng.uniform(-0.12, 0.12)
                top = rng.uniform(1.12, 1.52)
                mesh.frustum("d6a12e", (xj, 0.46, zj), (xj + 0.05, top, zj), 0.032, 0.025, 3)
                mesh.frustum("ffd452", (xj + 0.05, top - 0.14, zj),
                             (xj + 0.09, top + 0.2, zj), 0.095, 0.024, 4)
            else:
                mesh.crown("5da12b", (x, 0.65, z), (0.36, 0.28, 0.37), rng)
                mesh.crown("86c435", (x, 0.81, z), (0.23, 0.25, 0.25), rng)
    mesh.write("wheat" if wheat else "greens")


def build_mountain(name, with_snow_band=True):
    mesh = Model()
    # 8-sided asymmetric low-poly alpine peak with angled diagonal snow facets & slate-cerulean summit
    rim = [
        (-1.00, 0.0, -0.18), (-0.70, 0.0, -0.76), (0.04, 0.0, -0.94), (0.74, 0.0, -0.72),
        (1.00, 0.0, -0.10), (0.72, 0.0, 0.74), (-0.08, 0.0, 0.88), (-0.76, 0.0, 0.62),
    ]
    snow_low = [
        (-0.60, 0.42, -0.10), (-0.42, 0.50, -0.45), (0.03, 0.38, -0.56), (0.48, 0.34, -0.46),
        (0.60, 0.44, -0.06), (0.44, 0.48, 0.45), (-0.05, 0.39, 0.53), (-0.47, 0.45, 0.38),
    ]
    snow_high = [
        (-0.36, 0.62, -0.06), (-0.22, 0.74, -0.24), (0.02, 0.58, -0.34), (0.28, 0.54, -0.27),
        (0.32, 0.68, -0.03), (0.24, 0.72, 0.25), (-0.03, 0.60, 0.31), (-0.28, 0.66, 0.22),
    ]
    apex = (0.02, 1.0, 0.01)

    green_a = ("528c66", "619a72", "477e5a", "669e76", "4f8863", "5c956e", "447a57", "5f9870")
    green_b = ("5b946d", "4c845f", "639c74", "538d67", "5f9870", "49815c", "649d75", "518a65")
    snow = "f2f6fc"
    snow_alt = "e6eef8"
    blue_peak = ("76a5d3", "6393c4", "86b3de", "5989ba", "6fa0cf", "8fbbe3", "5e8ec0", "7eabD8")
    mid_blue = ("6898c8", "7aa8d6", "5b8bbd", "82b0dc", "6494c5", "76a5d3", "5787b8", "7caad7")

    # Asymmetric snow pattern: snow sweeps diagonally across main sunlit ridges while leaving some rock-blue facets exposed
    snow_mask_a = (True, True, False, True, True, False, True, True)
    snow_mask_b = (True, False, True, True, False, True, True, False)

    for i in range(8):
        j = (i + 1) % 8
        mesh.face(green_a[i], (rim[i], snow_low[i], rim[j]))
        mesh.face(green_b[i], (rim[j], snow_low[i], snow_low[j]))
        band_c1 = (snow if snow_mask_a[i] else mid_blue[i]) if with_snow_band else mid_blue[i]
        band_c2 = (snow_alt if snow_mask_b[i] else blue_peak[i]) if with_snow_band else blue_peak[i]
        mesh.face(band_c1, (snow_low[i], snow_high[i], snow_low[j]))
        mesh.face(band_c2, (snow_low[j], snow_high[i], snow_high[j]))
        mesh.face(blue_peak[i], (snow_high[i], apex, snow_high[j]))
    mesh.write(name)


def rocks():
    mesh = Model()
    rng = random.Random(71)
    phi = (1 + math.sqrt(5)) / 2
    vertices = [
        (-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0),
        (0, -1, phi), (0, 1, phi), (0, -1, -phi), (0, 1, -phi),
        (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1),
    ]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    points = [
        tuple(c + d * r * rng.uniform(0.92, 1.08) / phi for c, d, r in zip((0, 0.65, 0), vertex, (1.06, 0.72, 0.94)))
        for vertex in vertices
    ]
    stone_tones = ("beb7ab", "b2aba0", "c7c0b4", "a8a196")
    for idx, face in enumerate(faces):
        mesh.solid(stone_tones[idx % len(stone_tones)], points, [face])
    mesh.write("boulder")

    build_mountain("mountain", with_snow_band=True)
    build_mountain("mountain-blue", with_snow_band=False)


def matte_tile(name, palette, cells, seed, *, blocks=False):
    """Rasterize periodic, uneven facets with correlated color and fine dry pigment."""
    size = 512
    step = size / cells
    rng = random.Random(seed)
    jitter = 0.16 if blocks else 0.30
    offsets = [(rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter)) for _ in range(cells * cells)]
    pixels = bytearray(size * size * 3)

    def point(x, y):
        dx, dy = offsets[(y % cells) * cells + x % cells]
        return ((x + dx) * step, (y + dy) * step)

    def paint(face):
        edges = list(zip(face, (*face[1:], face[0])))
        cx, cy = (sum(vertex[i] for vertex in face) / (len(face) * size) for i in range(2))
        tone = 0.50 + 0.22 * math.sin(math.tau * (cx + cy)) + 0.12 * math.cos(math.tau * (cx - 2 * cy))
        index = min(len(palette) - 1, max(0, int((tone + rng.uniform(-0.19, 0.19)) * len(palette))))
        color = bytes.fromhex(palette[index])
        for y in range(math.floor(min(p[1] for p in face)), math.ceil(max(p[1] for p in face))):
            for x in range(math.floor(min(p[0] for p in face)), math.ceil(max(p[0] for p in face))):
                if any((b[0] - a[0]) * (y + 0.5 - a[1]) < (b[1] - a[1]) * (x + 0.5 - a[0])
                       for a, b in edges):
                    continue
                offset = ((y % size) * size + x % size) * 3
                grain = rng.randint(-5, 5) + round(2 * math.sin(x * 0.21 + y * 0.32) * math.sin(y * 0.12))
                pixels[offset:offset + 3] = bytes(max(0, min(255, c + grain)) for c in color)

    for y in range(cells):
        for x in range(cells):
            a, b, c, d = point(x, y), point(x + 1, y), point(x + 1, y + 1), point(x, y + 1)
            if blocks:
                paint((a, b, c, d))
            else:
                triangles = ((a, b, d), (b, c, d)) if rng.random() < 0.5 else ((a, b, c), (a, c, d))
                for triangle in triangles:
                    paint(triangle)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    assert all(pixels)
    stride = size * 3
    rows = b"".join(b"\x00" + pixels[y * stride:(y + 1) * stride] for y in range(size))
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "tile.png"
        source.write_bytes(b"\x89PNG\r\n\x1a\n"
                           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(rows))
                           + chunk(b"IEND", b""))
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "92",
                        str(source), "--out", str(OUTPUT / f"{name}.jpg")], check=True, capture_output=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Directory for offline exports before CDN publication")
    OUTPUT = parser.parse_args().output
    OUTPUT.mkdir(parents=True, exist_ok=True)
    house()
    house(barn=True)
    arch(-1)
    arch(1)
    trees()
    crop_bed(wheat=True)
    crop_bed(wheat=False)
    rocks()
    matte_tile("meadow-blocks", ("4b7133", "5f8436", "749539", "91aa42", "a8bb4a", "bcc652"),
               9, 232, blocks=True)
