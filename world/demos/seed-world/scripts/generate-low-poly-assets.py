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

        positions, normals, colors = [], [], []
        for color, (part_positions, part_normals) in self.parts.items():
            rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
            positions.extend(part_positions)
            normals.extend(part_normals)
            colors.extend([linear] * len(part_positions))
        document["materials"].append(dict(name="Low Poly vertex colors", pbrMetallicRoughness=dict(
            metallicFactor=0, roughnessFactor=0.87)))
        document["meshes"][0]["primitives"].append(dict(
            attributes=dict(POSITION=accessor(positions, True), NORMAL=accessor(normals), COLOR_0=accessor(colors)),
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
    wood, walls, stone = "765036", "e8b46e" if barn else "ffe2a0", "ada08b"
    mesh.box(stone, (0, 0.32, 0), (8.4, 0.64, 6.6))
    mesh.box(walls, (0, 2.36, 0), (8, 3.6, 6.2))
    mesh.solid(walls, [(-4, 4.16, -3.1), (4, 4.16, -3.1), (0, 7.05, -3.1),
                      (-4, 4.16, 3.1), (4, 4.16, 3.1), (0, 7.05, 3.1)],
               [(0, 1, 2), (3, 4, 5), (0, 1, 4, 3), (0, 2, 5, 3), (1, 2, 5, 4)])
    roof_angle = math.atan2(2.89, 4)
    for side in (-1, 1):
        mesh.box(wood, (side * 2.22, 5.58, 0), (5.65, 0.24, 7.36), roll=-side * roof_angle)
        for row in range(7):
            x = side * (row + 0.52) * 0.65
            for column in range(8):
                z = (column - 3.5) * 0.91
                mesh.box(("c6613b", "d47545", "e88954")[(row + column * 2) % 3],
                         (x, 7.52 - abs(x) * 2.89 / 4, z), (0.84, 0.15, 0.91), roll=-side * roof_angle)
        mesh.box(wood, (side * 4.01, 3.97, 0), (0.22, 0.24, 6.43))
        for z in (-3.02, 0, 3.02):
            mesh.box(wood, (side * 4, 2.42, z), (0.23, 3.45, 0.22))
            mesh.box(wood, (side * z * 1.26, 2.42, -3.12), (0.24, 3.45, 0.22))
        mesh.box(wood, (side * 1.86, 5.43, -3.17), (3.93, 0.16, 0.15), roll=-side * roof_angle)
    mesh.box("cf6b42", (0, 7.55, 0), (0.37, 0.18, 7.38))
    mesh.box(wood, (0, 4.13, -3.18), (8.25, 0.24, 0.19))
    mesh.box(wood, (0, 5.43, -3.18), (0.2, 2.58, 0.19))
    mesh.box("875331", (0, 1.75, -3.19), (3.35 if barn else 1.33, 2.5, 0.15))
    for x in (-2.47, 2.47):
        mesh.box(wood, (x, 2.48, -3.22), (1.31, 1.44, 0.24))
        mesh.box("e7b465", (x, 2.51, -3.36), (0.96, 1.1, 0.025))
        mesh.box(wood, (x, 2.51, -3.39), (0.1, 1.1, 0.08))
        mesh.box(wood, (x, 2.51, -3.39), (0.96, 0.1, 0.08))
        mesh.box("946944", (x, 1.8, -3.34), (1.42, 0.16, 0.36))
    for step in range(3):
        mesh.box(stone, (0, 0.1 + step * 0.09, -3.75 + step * 0.17), (2.06, 0.2 + step * 0.18, 0.62))
    if not barn:
        mesh.box("897f70", (-1.63, 6.92, 1.83), (0.85, 2.33, 0.76))
        mesh.box("aca08d", (-1.63, 8.11, 1.83), (1.05, 0.26, 0.94))
    mesh.write("barn" if barn else "cottage")


def arch(side):
    mesh = Model()
    stone = ("b3a087", "c6ae91", "bba88e", "c7b092")
    for row in range(3):
        mesh.box(stone[row], (0, 0.28 + row * 0.565, 0), (1.62 - row * 0.055, 0.555, 1.7 - row * 0.08))
    # Leave the walking lane between the independently reserved piers.
    for i in range(6):
        start = i * math.pi / 12 + 0.0035
        end = (i + 1) * math.pi / 12 - 0.0035
        xy = [(side * (r * math.cos(a) - 3.5), 1.7 + r * math.sin(a))
              for r, a in ((2.74, start), (4.3, start), (4.3, end), (2.74, end))]
        mesh.solid(stone[(i + 1 + side) % 4],
                   [(x, y, z) for z in (-0.71, 0.71) for x, y in xy],
                   [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
    mesh.write("arch-west" if side > 0 else "arch-east")


def trees():
    mesh = Model()
    mesh.frustum("7c5334", (0, 0, 0), (0.3, 7.6, 0), 1.12, 0.37, 7)
    rng = random.Random(211)
    for x, y, z, radius, color in (
        (-3.3, 8.3, -0.2, 3.7, "658f39"), (3.1, 8.8, 0.1, 4, "86a942"),
        (-0.15, 10.2, -1.8, 3.55, "9abd4a"), (0.3, 9, 2.4, 3.68, "739e3e"),
    ):
        mesh.frustum("755032", (0, 3.7, 0), (x, y, z), 0.54, 0.14, 6)
        mesh.crown(color, (x, y, z), (radius, radius * 0.83, radius), rng)
    mesh.write("oak")
    mesh = Model()
    mesh.frustum("80573a", (0, 0, 0), (0, 8.1, 0), 0.35, 0.09, 6)
    for i, color in enumerate(("315d45", "40734c", "50864f", "689853")):
        mesh.frustum(color, (0, 1.55 + i * 1.66, 0), (0, 6 + i * 1.33, 0), 2.55 - i * 0.55, 0.024, 7)
    mesh.write("pine")


def crop_bed(wheat):
    mesh = Model()
    rng = random.Random(141)
    mesh.box("876042", (0, 0.16, 0), (5.5, 0.45, 8.5))
    for x in (-2.68, 2.68):
        for z in (-4, 0, 4):
            mesh.box("825639", (x, 0.59, z), (0.17, 1.2, 0.17))
        for y in (0.48, 0.83):
            mesh.box("986744", (x, y, 0), (0.1, 0.12, 8.24))
    for row in range(6 if wheat else 4):
        x = (row - 2.5) * 0.79 if wheat else (row - 1.5) * 1.16
        mesh.box("a27950", (x, 0.36, 0), (0.57, 0.23, 7.6))
        for column in range(20 if wheat else 9):
            z = (column - 9.5) * 0.37 if wheat else (column - 4) * 0.8
            if wheat:
                xj, zj = x + rng.uniform(-0.25, 0.25), z + rng.uniform(-0.12, 0.12)
                top = rng.uniform(1.0, 1.38)
                mesh.frustum("be943a", (xj, 0.46, zj), (xj + 0.055, top, zj), 0.029, 0.023, 3)
                mesh.frustum("f2c45f", (xj + 0.055, top - 0.13, zj),
                             (xj + 0.1, top + 0.16, zj), 0.085, 0.022, 4)
            else:
                mesh.crown("659647", (x, 0.65, z), (0.36, 0.28, 0.37), rng)
                mesh.crown("93ac51", (x, 0.81, z), (0.23, 0.25, 0.25), rng)
    mesh.write("wheat" if wheat else "greens")


def rocks():
    mesh = Model()
    rng = random.Random(71)
    mesh.crown("b0a08c", (0, 0.65, 0), (1.05, 0.67, 0.92), rng)
    mesh.write("boulder")

    mesh = Model()
    rim = [(-1, 0, -0.21), (-0.67, 0, -0.74), (0.08, 0, -0.91),
           (0.76, 0, -0.69), (1, 0, -0.12), (0.69, 0, 0.73),
           (-0.11, 0, 0.84), (-0.74, 0, 0.59)]
    shoulder = [(-0.74, 0.25, -0.08), (-0.42, 0.54, -0.43), (0.16, 0.40, -0.52),
                (0.53, 0.33, -0.36), (0.63, 0.37, 0.02), (0.42, 0.41, 0.45),
                (-0.16, 0.58, 0.37), (-0.55, 0.36, 0.30)]
    crest = [(-0.31, 0.77, -0.01), (-0.06, 0.68, -0.09), (0.17, 1, 0.14), (0.43, 0.53, 0.13)]
    lower_colors = ("5a876b", "78a07a", "719570", "638e7e", "5b826e", "709675", "608977", "789d7d")
    summit_colors = ("7692a9", "9aafc2", "809cb6", "617d9d", "708eaa", "96acba", "6987a5", "8098b0")
    # XZ rings advance counterclockwise when seen on a plan. Their order gives upward normals.
    for i in range(8):
        j = (i + 1) % 8
        mesh.face(lower_colors[i], (rim[i], shoulder[i], rim[j]))
        mesh.face(lower_colors[j], (rim[j], shoulder[i], shoulder[j]))
        k, next_k = i // 2, j // 2
        mesh.face(summit_colors[i], (shoulder[i], crest[k], shoulder[j]))
        if k != next_k:
            mesh.face(summit_colors[j], (shoulder[j], crest[k], crest[next_k]))
    mesh.face("90a7bd", (crest[0], crest[2], crest[1]))
    mesh.face("758faa", (crest[0], crest[2], crest[3]))
    mesh.write("mountain")


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
