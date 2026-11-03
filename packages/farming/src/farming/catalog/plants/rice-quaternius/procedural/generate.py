"""Mobile rice authoring; Python 3 only, no runtime GLB or Blender dependency.

The shared blade template supplies shape; each leaf supplies attachment, size and birth.
Dimensions/colors come from ../normalization-report.json; organ layout is authored.
"""
import math
import pathlib
import struct
import sys
import zlib

ROOT = pathlib.Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT.parents[3] / 'procedural/tools'))
from recipe_authoring import write_recipe

AGES = [0, .33, .67, 1]
HEIGHTS = [.367867, .564754, .769144, .953455]
GREEN = [.2316462398, .4479746521, .1264601797]
GRAIN = [.5321990848, .6618604660, .2007026523]


def key(age, value):
    return dict(age=age, value=value)


def curve(values):
    return [key(age, value) for age, value in zip(AGES, values)]


recipe = dict(schemaVersion=1, revision=1, id='rice-quaternius', anchors=[], surfaces=[], leafTemplates=[
    dict(id='blade', columns=3, rows=5, uv=[.25, .5], poses=curve([
        dict(length=h, width=w, bend=b, droop=d, ridge=.0025)
        for h, w, b, d in zip(HEIGHTS, [.010, .014, .020, .022], [.065, .12, .30, .34], [.02, .12, .32, .40])
    ]))
], stems=[], leaves=[], volumes=[], supports=[], maturity=[key(0, 0), key(1, 1)])


def anchor(id, points, angle=0, parent=None):
    item = dict(id=id, poses=curve([dict(offset=p, azimuth=angle) for p in points]))
    if parent:
        item['parent'] = parent
    recipe['anchors'].append(item)
    return id


for tiller in range(5):
    angle = tiller * 2.399963
    birth = [0, .14, .24, .37, .46][tiller]
    expansion = [max(0, min(1, (a - birth) / .30)) for a in AGES]
    if tiller == 0:
        expansion = [1] * 4
    factor = 1 - tiller * .055
    root = anchor(f't{tiller}', [[0, 0, 0]] * 4, angle)
    culm = [h * factor * (.12 if i == 0 else .38 if i == 1 else .65 if i == 2 else .82) * expansion[i]
            for i, h in enumerate(HEIGHTS)]
    nodes = []
    for j in range(5):
        t = j / 4
        nodes.append(anchor(f't{tiller}-n{j}', [[.065 * t * t * e, h * t, 0]
                                              for h, e in zip(culm, expansion)], parent=root))
    recipe['stems'].append(dict(id=f'culm-{tiller}', path=nodes, radii=curve([
        [.003 * e * (1 - j * .12) for j in range(5)] for e in expansion
    ]), sides=4, uv=[.25, .5]))
    for leaf in range(4):
        leafid = f'blade-{tiller}-{leaf}'
        base = anchor(leafid + '-base', [[0, 0, 0]] * 4,
                      angle=(0 if leaf % 2 == 0 else math.pi) + leaf * .27, parent=nodes[leaf])
        start = max(birth, [0, 0, .12, .25][leaf])
        recipe['leaves'].append(dict(
            id=leafid, anchor=base, template='blade',
            size=[1 - .08 * leaf, [.90, .78, .66, .56][leaf] * (1 - tiller * .06), 1],
            scale=[key(start, 0), key(max(.18, start + .23), 1)] if start else [key(0, 1)]
        ))
    # Retain the curved rachis; sub-millimetre pedicels are absorbed into attached clusters.
    panicle = []
    for j in range(7):
        t = j / 6
        panicle.append(anchor(f'panicle-{tiller}-{j}', [
            [0, 0, 0], [0, 0, 0], [0, .018 * t, 0], [.15 * t * t, .18 * math.sin(t * 2.1), 0]
        ], parent=nodes[-1]))
    recipe['stems'].append(dict(id=f'rachis-{tiller}', path=panicle, radii=curve([
        [0] * 7, [0] * 7, [.0004] * 7, [.0017 * (1 - j / 9) for j in range(7)]
    ]), sides=3, uv=[.75, .5]))
    # Each ellipsoid represents two neighbouring grains and attaches directly to the rachis.
    for j in [2, 4, 6]:
        for side in [-1, 1]:
            recipe['volumes'].append(dict(
                id=f'grain-cluster-{tiller}-{j}-{side}', kind='fruit', anchor=panicle[j],
                poses=[key(0, dict(offset=[.004, -.014, side * .005], radii=[.006, .021, .006]))],
                scale=[key(.70 + tiller * .02, 0), key(1, 1)], uv=[.75, .5], tint=False
            ))

print(f"recipe.json: {write_recipe(ROOT / 'recipe.json', recipe)} bytes")


def srgb(x):
    return round(255 * (12.92 * x if x <= .0031308 else 1.055 * x ** (1 / 2.4) - .055))


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


colors = [bytes([*map(srgb, c), 255]) for c in [GREEN, GRAIN]]
raw = b''.join(b'\0' + colors[0] * 8 + colors[1] * 8 for _ in range(8))
ROOT.joinpath('atlas.png').write_bytes(b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 8, 8, 6, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
