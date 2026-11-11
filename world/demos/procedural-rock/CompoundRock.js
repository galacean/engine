import { readSolidSurface } from "@galacean/engine-terrain/rock-formation/generator/solid-surface.js";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";

/** Union already reduced procedural bodies. OBBs remain separate authoring volumes;
 * only the exterior is rendered. This experiment does not change Seed generation.
 * @param {Array<{parameters: object, center: number[], yaw?: number, lean?: number}>} guides
 * @param {object} reduction Per-input error/triangle budget, not a total union budget.
 * @param {object} api Initialized Manifold WASM module, owned by the worker.
 * @param {number} cut Fraction of local depth removed by two inclined planes.
 */
export function unionRocks(guides, reduction, api, cut = 0) {
  const start = performance.now(),
    resources = [];
  const own = (solid) => (resources.push(solid), solid);
  let rawTriangles = 0,
    inputTriangles = 0,
    inputBytes = 0,
    simplifyMs = 0;
  const boxes = [],
    originalIDs = new Set();
  try {
    const solids = guides.map(({ parameters, center, yaw = 0, lean = 0 }) => {
      const rock = simplifyRock(buildRock(parameters), reduction);
      rawTriangles += rock.stats.rawTriangles;
      inputTriangles += rock.indices.length / 3;
      inputBytes += rock.stats.rawBytes;
      simplifyMs += rock.stats.simplifyMs;
      const props = new Float32Array((rock.positions.length / 3) * 7);
      for (let v = 0; v < props.length / 7; v++) {
        props.set(rock.positions.subarray(v * 3, v * 3 + 3), v * 7);
        props.set(rock.normals.subarray(v * 3, v * 3 + 3), v * 7 + 3);
        props[v * 7 + 6] = rock.surfaceRoles?.[v] ?? 0;
      }
      let solid = own(new api.Manifold(new api.Mesh({ numProp: 7, vertProperties: props, triVerts: rock.indices })));
      originalIDs.add(solid.originalID());
      if (cut > 0) {
        const depth = parameters.obbDepth / 2;
        for (const side of [-1, 1]) {
          // Actual planar cuts, within the authored OBB. These create broad faces
          // without rounding the whole body or adding another offset shell.
          const normal = [0.09 * side, 0.1, -side],
            length = Math.hypot(...normal);
          solid = own(solid.trimByPlane(normal, (-depth * (1 - cut)) / length));
        }
      }
      const radians = Math.PI / 180,
        a = yaw * radians,
        b = lean * radians;
      const transform = ([x, y, z]) => {
        const X = x * Math.cos(b) - y * Math.sin(b),
          Y = x * Math.sin(b) + y * Math.cos(b);
        return [
          X * Math.cos(a) + z * Math.sin(a) + center[0],
          Y + center[1],
          -X * Math.sin(a) + z * Math.cos(a) + center[2]
        ];
      };
      boxes.push(
        Array.from({ length: 8 }, (_, i) =>
          transform([
            rock.envelopeBounds[i & 1 ? 1 : 0][0],
            rock.envelopeBounds[i & 2 ? 1 : 0][1],
            rock.envelopeBounds[i & 4 ? 1 : 0][2]
          ])
        )
      );
      solid = own(solid.rotate([0, 0, lean]));
      solid = own(solid.rotate([0, yaw, 0]));
      return own(solid.translate(center));
    });
    const unionStart = performance.now();
    const combined = own(api.Manifold.union(solids));
    const components = combined.decompose();
    const componentCount = components.length;
    components.forEach((part) => part.delete());
    // Audit geometric turns before normals introduce property seams.
    const topology = combined.getMesh();
    const turns = measureTurns(topology);
    const { positions, normals, surfaceRoles, indices } = readSolidSurface(combined, originalIDs);
    const count = positions.length / 3;
    const bounds = [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity]
    ];
    for (let v = 0; v < count; v++) {
      for (let axis = 0; axis < 3; axis++) {
        bounds[0][axis] = Math.min(bounds[0][axis], positions[v * 3 + axis]);
        bounds[1][axis] = Math.max(bounds[1][axis], positions[v * 3 + axis]);
      }
    }
    const envelopeBounds = [0, 1].map((side) =>
      [0, 1, 2].map((axis) => (side ? Math.max : Math.min)(...boxes.flat().map((p) => p[axis])))
    );
    const triangles = indices.length / 3;
    return {
      positions,
      normals,
      indices,
      surfaceRoles,
      bounds,
      envelopeBounds,
      guideBoxes: boxes,
      stats: {
        rawTriangles,
        triangles,
        vertices: count,
        rawBytes: inputBytes,
        meshBytes: positions.byteLength + normals.byteLength + indices.byteLength + surfaceRoles.byteLength,
        reduction: 1 - triangles / rawTriangles,
        inputTriangles,
        bakeMs: performance.now() - start - simplifyMs,
        simplifyMs,
        unionMs: performance.now() - unionStart,
        componentCount,
        ...turns,
        targetTriangles: 0,
        simplificationMethod: "compound-union",
        guides: guides.length
      }
    };
  } finally {
    // WASM solids are not managed by JavaScript GC.
    resources.reverse().forEach((solid) => solid.delete());
  }
}

function measureTurns(mesh) {
  const canonical = Uint32Array.from({ length: mesh.numVert }, (_, v) => v);
  for (let i = 0; i < mesh.mergeFromVert.length; i++) canonical[mesh.mergeFromVert[i]] = mesh.mergeToVert[i];
  const resolve = (v) => {
    while (canonical[v] !== v) v = canonical[v];
    return v;
  };
  const edges = new Map();
  let maxFaceTurn = 0,
    sharpEdges = 0;
  for (let t = 0; t < mesh.triVerts.length; t += 3) {
    const ids = Array.from(mesh.triVerts.subarray(t, t + 3));
    const [a, b, c] = ids.map((v) => Array.from(mesh.vertProperties.subarray(v * mesh.numProp, v * mesh.numProp + 3)));
    const u = b.map((x, i) => x - a[i]),
      v = c.map((x, i) => x - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    if (!length) continue;
    const normal = n.map((x) => x / length);
    for (let e = 0; e < 3; e++) {
      const from = resolve(ids[e]),
        to = resolve(ids[(e + 1) % 3]),
        key = `${Math.min(from, to)}/${Math.max(from, to)}`;
      const prior = edges.get(key);
      if (!prior) edges.set(key, normal);
      else {
        const turn =
          (Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                normal.reduce((sum, x, i) => sum + x * prior[i], 0)
              )
            )
          ) *
            180) /
          Math.PI;
        maxFaceTurn = Math.max(maxFaceTurn, turn);
        if (turn > 90.1) sharpEdges++;
      }
    }
  }
  return { maxFaceTurn, sharpEdges };
}

/** Two independently sized OBBs in one local frame; all shaping remains procedural. */
export function compoundGuides(p) {
  return [
    { parameters: p, center: [0, 0, 0] },
    {
      parameters: {
        ...p,
        seed: p.seed + 997,
        obbWidth: p.blockWidth,
        obbHeight: p.blockHeight,
        obbDepth: p.blockDepth,
        topDirection: (p.topDirection + 55) % 360
      },
      center: [p.blockX, p.blockY, p.blockZ],
      yaw: p.blockYaw,
      lean: p.blockLean
    }
  ];
}
